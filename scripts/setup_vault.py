#!/usr/bin/env python3
"""
AEGIS Vault Setup Script
Configures Vault dev mode with:
- AppRole authentication for FastAPI and ARQ worker
- Dynamic PostgreSQL credentials engine (legacy — see note below)
- Transit Secrets Engine for field encryption
- PKI Secrets Engine for mTLS certificates (demo configuration)
- KV v2 secrets engine, seeded with the 5 external inference-provider API
  keys (DEC-060/DEC-061/OPEN-14's chosen Vault repurpose direction)

Vault is running in dev mode: auto-unsealed, root token = aegis-dev-root-token

NOTE on the Database Secrets Engine below: DEC-051's PgBouncer fix replaced
dynamic Vault-issued Postgres credentials with a static least-privilege role
(`aegis_pooled_role`) — nothing in the application calls
`database/creds/aegis-operational-role` any longer. Left provisioned here
rather than removed (this script's job is to provision Vault, not to decide
the applicationwide Postgres-auth story), but real, current use of Vault
starts with the KV v2 setup below.

Usage: python scripts/setup_vault.py
"""
import os
import sys
import time
import json
import urllib.request
import urllib.error

from dotenv import load_dotenv

load_dotenv()

VAULT_URL = "http://localhost:8200"
VAULT_TOKEN = "aegis-dev-root-token"
POSTGRES_HOST = "aegis-postgres-primary"
POSTGRES_ADMIN_PASSWORD = "aegis_admin_dev_2024"

# The 5 external inference-provider keys this session's Vault repurpose
# targets — same env var names config.py already reads via os.getenv, so
# the KV v2 secret and the .env fallback share one naming scheme.
PROVIDER_KEY_ENV_VARS = [
    "GROQ_API_KEY",
    "CEREBRAS_API_KEY",
    "SAMBANOVA_API_KEY",
    "CLOUDFLARE_API_TOKEN",
    "GEMINI_API_KEY",
]
PROVIDER_KEYS_PATH = "aegis/inference-provider-keys"


def vault_request(method: str, path: str, body=None):
    url = f"{VAULT_URL}/v1{path}"
    data = json.dumps(body).encode() if body else None
    req = urllib.request.Request(url, data=data, method=method)
    req.add_header("X-Vault-Token", VAULT_TOKEN)
    req.add_header("Content-Type", "application/json")
    try:
        resp = urllib.request.urlopen(req, timeout=15)
        content = resp.read()
        return json.loads(content) if content else {}
    except urllib.error.HTTPError as e:
        content = e.read().decode()
        if e.code == 400 and ("already exists" in content or "already enabled" in content or "already in use" in content):
            return {"already_exists": True}
        raise RuntimeError(f"Vault error {e.code} at {path}: {content[:300]}")


def wait_for_vault() -> bool:
    print("Waiting for Vault to be ready...")
    for i in range(20):
        try:
            resp = urllib.request.urlopen(f"{VAULT_URL}/v1/sys/health", timeout=5)
            data = json.loads(resp.read())
            if data.get("initialized") and not data.get("sealed"):
                print("  \u2713 Vault is ready (initialized, unsealed)")
                return True
        except Exception:
            pass
        time.sleep(2)
        print(f"  Waiting... ({i+1}/20)")
    return False


def setup_approle() -> dict:
    """Enable AppRole auth and create policies and roles for AEGIS services."""
    print("\nSetting up AppRole authentication...")

    # Enable AppRole auth method
    result = vault_request("POST", "/sys/auth/approle", {"type": "approle"})
    if result.get("already_exists"):
        print("  \u2713 AppRole auth already enabled")
    else:
        print("  \u2713 AppRole auth enabled")

    # Create policy for FastAPI (broad access for demo)
    fastapi_policy = """
path "secret/*" { capabilities = ["read", "list"] }
path "database/creds/aegis-operational-role" { capabilities = ["read"] }
path "transit/encrypt/aegis-transit-key" { capabilities = ["update"] }
path "transit/decrypt/aegis-transit-key" { capabilities = ["update"] }
path "pki/issue/aegis-service-certs" { capabilities = ["create", "update"] }
path "auth/token/renew-self" { capabilities = ["update"] }
"""
    vault_request("POST", "/sys/policies/acl/aegis-fastapi-policy",
                  {"policy": fastapi_policy})
    print("  \u2713 FastAPI policy created")

    # Create AppRole for FastAPI
    vault_request("POST", "/auth/approle/role/aegis-fastapi", {
        "policies": ["aegis-fastapi-policy"],
        "token_ttl": "6h",
        "token_max_ttl": "24h",
        "bind_secret_id": True,
        "secret_id_ttl": "0",  # Never expires in dev mode
    })
    print("  \u2713 FastAPI AppRole created")

    # Get role ID
    role_id_resp = vault_request("GET", "/auth/approle/role/aegis-fastapi/role-id")
    role_id = role_id_resp["data"]["role_id"]

    # Generate secret ID
    secret_id_resp = vault_request("POST", "/auth/approle/role/aegis-fastapi/secret-id", {})
    secret_id = secret_id_resp["data"]["secret_id"]

    print("  \u2713 FastAPI AppRole configured")
    print(f"    Role ID: {role_id}")
    print(f"    Secret ID: {secret_id[:8]}... (first 8 chars)")

    return {"role_id": role_id, "secret_id": secret_id}


def setup_database_engine() -> bool:
    """Configure dynamic PostgreSQL credentials via Vault Database Secrets Engine."""
    print("\nSetting up Database Secrets Engine...")

    # Enable database secrets engine
    result = vault_request("POST", "/sys/mounts/database", {"type": "database"})
    if result.get("already_exists"):
        print("  \u2713 Database secrets engine already enabled")
    else:
        print("  \u2713 Database secrets engine enabled")

    # Configure PostgreSQL connection
    db_config = {
        "plugin_name": "postgresql-database-plugin",
        "allowed_roles": ["aegis-operational-role"],
        "connection_url": f"postgresql://postgres:{POSTGRES_ADMIN_PASSWORD}@{POSTGRES_HOST}:5432/aegis",
        "max_open_connections": 5,
        "max_connection_lifetime": "5s",
        "username": "postgres",
        "password": POSTGRES_ADMIN_PASSWORD,
    }
    vault_request("POST", "/database/config/aegis-postgres", db_config)
    print("  \u2713 PostgreSQL connection configured")

    # Create dynamic credential role (1-hour TTL)
    role_config = {
        "db_name": "aegis-postgres",
        "creation_statements": [
            "CREATE ROLE \"{{name}}\" WITH LOGIN PASSWORD '{{password}}' VALID UNTIL '{{expiration}}';",
            "GRANT aegis_app_role TO \"{{name}}\";",
        ],
        "revocation_statements": [
            "DROP ROLE IF EXISTS \"{{name}}\";",
        ],
        "default_ttl": "1h",
        "max_ttl": "2h",
    }
    vault_request("POST", "/database/roles/aegis-operational-role", role_config)
    print("  \u2713 Dynamic credential role created (1-hour TTL)")

    # Test credential generation
    try:
        creds = vault_request("GET", "/database/creds/aegis-operational-role")
        test_user = creds["data"]["username"]
        print(f"  \u2713 Test dynamic credential generated: {test_user[:20]}...")
    except Exception as e:
        print(f"  \u26a0 Could not test credential generation: {e}")

    return True


def setup_transit_engine() -> bool:
    """Configure Transit Secrets Engine for field-level encryption."""
    print("\nSetting up Transit Secrets Engine...")

    # Enable transit engine
    result = vault_request("POST", "/sys/mounts/transit", {"type": "transit"})
    if result.get("already_exists"):
        print("  \u2713 Transit engine already enabled")
    else:
        print("  \u2713 Transit engine enabled")

    # Create encryption key for AEGIS
    vault_request("POST", "/transit/keys/aegis-transit-key", {
        "type": "aes256-gcm96",
        "derived": False,
        "exportable": False,
        "allow_plaintext_backup": False,
    })
    print("  \u2713 Transit encryption key created: aegis-transit-key")

    # Test encrypt/decrypt
    import base64
    test_data = base64.b64encode(b"test config value").decode()
    encrypt_resp = vault_request("POST", "/transit/encrypt/aegis-transit-key",
                                 {"plaintext": test_data})
    ciphertext = encrypt_resp["data"]["ciphertext"]

    decrypt_resp = vault_request("POST", "/transit/decrypt/aegis-transit-key",
                                 {"ciphertext": ciphertext})
    decrypted = base64.b64decode(decrypt_resp["data"]["plaintext"]).decode()

    if decrypted == "test config value":
        print("  \u2713 Transit encrypt/decrypt verified")
    else:
        print("  \u2717 Transit encrypt/decrypt mismatch!")
        return False

    return True


def setup_pki_engine() -> bool:
    """Configure PKI Secrets Engine for mTLS certificates (demo configuration)."""
    print("\nSetting up PKI Secrets Engine...")

    # Enable PKI engine
    result = vault_request("POST", "/sys/mounts/pki", {
        "type": "pki",
        "config": {"max_lease_ttl": "87600h"}  # 10 years for root CA
    })
    if result.get("already_exists"):
        print("  \u2713 PKI engine already enabled")
    else:
        print("  \u2713 PKI engine enabled")

    # Generate root CA
    try:
        ca_resp = vault_request("POST", "/pki/root/generate/internal", {
            "common_name": "AEGIS Internal CA",
            "ttl": "87600h",
            "key_type": "rsa",
            "key_bits": 2048,
        })
        if not ca_resp.get("already_exists"):
            print("  \u2713 Root CA generated: AEGIS Internal CA")
    except Exception as e:
        print(f"  \u26a0 CA generation: {e} (may already exist)")

    # Configure CRL and issuer URLs
    vault_request("POST", "/pki/config/urls", {
        "issuing_certificates": f"{VAULT_URL}/v1/pki/ca",
        "crl_distribution_points": f"{VAULT_URL}/v1/pki/crl",
    })

    # Create certificate role for AEGIS services
    vault_request("POST", "/pki/roles/aegis-service-certs", {
        "allowed_domains": ["aegis.internal", "localhost"],
        "allow_subdomains": True,
        "allow_localhost": True,
        "max_ttl": "24h",
        "key_type": "rsa",
        "key_bits": 2048,
    })
    print("  \u2713 Certificate role created: aegis-service-certs (24h TTL)")

    # Test certificate issuance
    cert_resp = vault_request("POST", "/pki/issue/aegis-service-certs", {
        "common_name": "aegis-fastapi.aegis.internal",
        "ttl": "24h",
    })
    if cert_resp.get("data", {}).get("certificate"):
        print("  \u2713 Test certificate issued for aegis-fastapi.aegis.internal")
    else:
        print("  \u26a0 Certificate issuance test inconclusive")

    return True


def setup_kv_engine() -> bool:
    """
    Enable a KV v2 secrets engine at 'secret/' (already auto-mounted by
    Vault's dev mode \u2014 confirmed live via GET /sys/mounts, "secret/":
    {"type": "kv", "options": {"version": "2"}} \u2014 this call is a no-op then,
    but still issued explicitly so this script provisions correctly against
    a real, non-dev Vault too, not just this project's dev-mode instance)
    and seed it with the 5 external inference-provider keys, read from
    whatever's currently in this script's own environment (i.e. .env's
    current values via load_dotenv() above) so a fresh Vault starts in sync
    with today's source of truth rather than empty.
    """
    print("\nSetting up KV v2 secrets engine...")

    result = vault_request("POST", "/sys/mounts/secret", {"type": "kv-v2"})
    if result.get("already_exists"):
        print("  \u2713 KV v2 engine already enabled at secret/")
    else:
        print("  \u2713 KV v2 engine enabled at secret/")

    keys = {name: os.environ.get(name, "") for name in PROVIDER_KEY_ENV_VARS}
    missing = [name for name, value in keys.items() if not value]
    if missing:
        print(
            f"  \u26a0 No value in this script's environment for: {', '.join(missing)} "
            f"\u2014 writing empty string for now; rotate in with a real value via "
            f"`vault kv put secret/{PROVIDER_KEYS_PATH} <NAME>=<value> ...` or the app's rotation flow."
        )

    vault_request("POST", f"/secret/data/{PROVIDER_KEYS_PATH}", {"data": keys})
    print(f"  \u2713 Inference-provider keys written to secret/{PROVIDER_KEYS_PATH}")
    print(f"    Keys present: {', '.join(name for name, value in keys.items() if value) or '(none)'}")

    return True


def main():
    print("=" * 60)
    print("AEGIS Vault Setup (Dev Mode)")
    print("=" * 60)

    if not wait_for_vault():
        print("ERROR: Vault not ready")
        sys.exit(1)

    approle_creds = setup_approle()
    setup_database_engine()
    setup_transit_engine()
    setup_pki_engine()
    setup_kv_engine()

    print("\n" + "=" * 60)
    print("\u2713 VAULT SETUP COMPLETE")
    print(f"\nFastAPI AppRole credentials (add to .env if needed):")
    print(f"  VAULT_ROLE_ID={approle_creds['role_id']}")
    print(f"  VAULT_SECRET_ID={approle_creds['secret_id']}")
    print("\nNOTE: In dev mode, Vault auto-unseals. No manual unseal needed.")
    sys.exit(0)


if __name__ == "__main__":
    main()
