"""
AEGIS Authentication Middleware
JWT verification using Keycloak's public keys (JWKS endpoint).
Checks: signature, expiry, revocation (Redis), audience, issuer.
Extracts user_id and role into request.state for downstream use.
"""
import hashlib
import json
import logging
import urllib.request
from typing import Optional

from fastapi import Request, WebSocket
from jose import jwt, JWTError, ExpiredSignatureError
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import JSONResponse, Response

from app.config import (
    KEYCLOAK_URL, KEYCLOAK_ISSUER_URL, KEYCLOAK_REALM, KEYCLOAK_CLIENT_ID,
    ACCESS_TOKEN_TTL_SECONDS,
)

logger = logging.getLogger(__name__)

# Cache for Keycloak public keys (refreshed on startup)
_keycloak_public_keys: dict = {}

# Paths that don't require authentication
PUBLIC_PATHS = [
    "/health",
    "/metrics",
    "/docs",
    "/openapi.json",
    "/favicon.ico",
]

JWKS_URL = f"{KEYCLOAK_URL}/realms/{KEYCLOAK_REALM}/protocol/openid-connect/certs"
ISSUER = f"{KEYCLOAK_ISSUER_URL}/realms/{KEYCLOAK_REALM}"


async def load_keycloak_public_keys():
    """
    Fetch and cache Keycloak JWKS (public keys for JWT signature verification).
    Called on FastAPI startup.
    """
    global _keycloak_public_keys
    try:
        resp = urllib.request.urlopen(JWKS_URL, timeout=10)
        jwks = json.loads(resp.read())
        _keycloak_public_keys = {key["kid"]: key for key in jwks.get("keys", [])}
        logger.info(f"Loaded {len(_keycloak_public_keys)} Keycloak public keys")
    except Exception as e:
        logger.error(f"Failed to load Keycloak public keys: {e}")
        logger.warning("Authentication will fail until keys are loaded. Will retry on next request.")


def _get_public_key(kid: str) -> Optional[dict]:
    """Get the public key by key ID. Refreshes JWKS if key not found."""
    global _keycloak_public_keys
    if kid in _keycloak_public_keys:
        return _keycloak_public_keys[kid]
    # Try refreshing
    try:
        resp = urllib.request.urlopen(JWKS_URL, timeout=5)
        jwks = json.loads(resp.read())
        _keycloak_public_keys = {key["kid"]: key for key in jwks.get("keys", [])}
        return _keycloak_public_keys.get(kid)
    except Exception:
        return None


class AuthenticationMiddleware(BaseHTTPMiddleware):
    """
    JWT authentication middleware.
    Runs after TraceIDMiddleware, before InputGovernanceMiddleware.

    On success: sets request.state.user_id and request.state.role
    On failure: returns 401 immediately
    """

    async def dispatch(self, request: Request, call_next) -> Response:
        path = request.url.path
        trace_id = getattr(request.state, "trace_id", "no-trace-id")

        # Skip auth for public paths
        if any(path.startswith(pp) for pp in PUBLIC_PATHS):
            request.state.user_id = None
            request.state.role = None
            return await call_next(request)

        # Extract JWT from cookie (HttpOnly cookie named "aegis_access_token")
        token = request.cookies.get("aegis_access_token")

        # Fallback: also check Authorization header (Bearer token)
        if not token:
            auth_header = request.headers.get("Authorization", "")
            if auth_header.startswith("Bearer "):
                token = auth_header[7:]

        if not token:
            return JSONResponse(
                status_code=401,
                content={"error": "no_token", "message": "Authentication required."},
                headers={"X-Trace-ID": trace_id}
            )

        # Decode JWT header to get key ID
        try:
            unverified_header = jwt.get_unverified_header(token)
            kid = unverified_header.get("kid")
        except JWTError:
            return JSONResponse(
                status_code=401,
                content={"error": "invalid_token", "message": "Invalid token format."},
                headers={"X-Trace-ID": trace_id}
            )

        # Get public key
        public_key = _get_public_key(kid) if kid else None
        if not public_key:
            return JSONResponse(
                status_code=401,
                content={"error": "unknown_key", "message": "Token signed with unknown key."},
                headers={"X-Trace-ID": trace_id}
            )

        # Verify JWT (signature, expiry, issuer)
        try:
            from jose.backends import RSAKey
            payload = jwt.decode(
                token,
                public_key,
                algorithms=["RS256"],
                issuer=ISSUER,
                options={"verify_exp": True, "verify_aud": False},
            )
        except ExpiredSignatureError:
            return JSONResponse(
                status_code=401,
                content={"error": "token_expired", "message": "Token has expired. Please log in again."},
                headers={"X-Trace-ID": trace_id}
            )
        except JWTError as e:
            logger.warning(f"JWT verification failed: {e}", extra={"trace_id": trace_id})
            return JSONResponse(
                status_code=401,
                content={"error": "invalid_token", "message": "Token verification failed."},
                headers={"X-Trace-ID": trace_id}
            )

        # Verify authorized party (azp) — Keycloak sets aud=account by default
        azp = payload.get("azp")
        if azp != KEYCLOAK_CLIENT_ID:
            return JSONResponse(
                status_code=401,
                content={"error": "invalid_client", "message": "Token not issued for this client."},
                headers={"X-Trace-ID": trace_id}
            )

        # Check revocation list (Redis SISMEMBER — O(1), <0.1ms)
        jti = payload.get("jti")
        if jti:
            try:
                from app.infrastructure.redis_client import redis_session
                is_revoked = await redis_session.is_token_revoked(jti)
                if is_revoked:
                    return JSONResponse(
                        status_code=401,
                        content={"error": "token_revoked", "message": "Token has been revoked."},
                        headers={"X-Trace-ID": trace_id}
                    )
            except Exception as e:
                # If Redis is down, log but don't block (fail open for revocation)
                logger.error(f"Redis revocation check failed: {e}", extra={"trace_id": trace_id})

        # Extract user claims
        user_id = payload.get("sub")
        realm_roles = payload.get("realm_access", {}).get("roles", [])
        role = "it-admin" if "it-admin" in realm_roles else "employee"

        # Attach to request state for downstream handlers
        request.state.user_id = user_id
        request.state.role = role
        request.state.jti = jti

        return await call_next(request)


async def ws_authenticate(websocket: WebSocket) -> Optional[dict]:
    """
    Authenticate a WebSocket connection via ?token= query parameter.
    The frontend fetches this token from /api/auth/ws-token before connecting.

    Mirrors AuthenticationMiddleware's own verification exactly: RS256
    signature check via the same cached JWKS (_get_public_key), issuer
    checked against ISSUER, verify_aud disabled with a manual azp check
    (Keycloak sets aud=account by default, not the client ID).
    """
    token = websocket.query_params.get("token")
    if not token:
        await websocket.close(code=4001, reason="Authentication required")
        return None

    try:
        unverified_header = jwt.get_unverified_header(token)
        kid = unverified_header.get("kid")
        public_key = _get_public_key(kid) if kid else None
        if not public_key:
            await websocket.close(code=4001, reason="Token signed with unknown key")
            return None

        payload = jwt.decode(
            token,
            public_key,
            algorithms=["RS256"],
            issuer=ISSUER,
            options={"verify_exp": True, "verify_aud": False},
        )

        azp = payload.get("azp")
        if azp != KEYCLOAK_CLIENT_ID:
            await websocket.close(code=4001, reason="Token not issued for this client")
            return None

        jti = payload.get("jti")
        if jti:
            from app.infrastructure.redis_client import redis_session
            if await redis_session.is_token_revoked(jti):
                await websocket.close(code=4001, reason="Token has been revoked")
                return None

        user_id = payload.get("sub", "")
        websocket.state.user_id = user_id
        websocket.state.user_id_hash = hashlib.sha256(user_id.encode()).hexdigest()
        realm_roles = payload.get("realm_access", {}).get("roles", [])
        websocket.state.role = "it-admin" if "it-admin" in realm_roles else "employee"
        websocket.state.jti = jti
        return payload

    except ExpiredSignatureError:
        await websocket.close(code=4001, reason="Token has expired")
        return None
    except JWTError:
        await websocket.close(code=4001, reason="Invalid token")
        return None
