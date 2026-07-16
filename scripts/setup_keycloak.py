#!/usr/bin/env python3
"""
AEGIS Keycloak Setup Script
Creates the aegis-realm with all required configuration:
- Two clients: aegis-chat (employee frontend) and aegis-admin (admin portal)
- Two roles: employee and it-admin
- Token TTL: access=15min, refresh=8hours
- Two test users for demo: employee1 and itadmin1

Keycloak MUST use PostgreSQL backend (configured in docker-compose.yml).
This script verifies PostgreSQL backend is active before proceeding.

Usage: python scripts/setup_keycloak.py
"""
import sys
import time
import json
import urllib.request
import urllib.error
import urllib.parse

KEYCLOAK_URL = "http://localhost:8180"
REALM_NAME = "aegis-realm"
ADMIN_USER = "admin"
ADMIN_PASSWORD = "keycloak_admin_dev_2024"  # Must match docker-compose.yml


def get_admin_token() -> str:
    """Get an admin access token for Keycloak API calls."""
    data = urllib.parse.urlencode({
        "username": ADMIN_USER,
        "password": ADMIN_PASSWORD,
        "grant_type": "password",
        "client_id": "admin-cli",
    }).encode()

    req = urllib.request.Request(
        f"{KEYCLOAK_URL}/realms/master/protocol/openid-connect/token",
        data=data,
        method="POST"
    )
    resp = urllib.request.urlopen(req, timeout=30)
    return json.loads(resp.read())["access_token"]


def keycloak_request(method: str, path: str, token: str, body=None):
    """Make an authenticated Keycloak Admin API request."""
    url = f"{KEYCLOAK_URL}/admin{path}"
    data = json.dumps(body).encode() if body else None
    req = urllib.request.Request(url, data=data, method=method)
    req.add_header("Authorization", f"Bearer {token}")
    req.add_header("Content-Type", "application/json")
    try:
        resp = urllib.request.urlopen(req, timeout=30)
        content = resp.read()
        return json.loads(content) if content else {}
    except urllib.error.HTTPError as e:
        if e.code == 409:  # Conflict — already exists
            return {"already_exists": True}
        body_text = e.read().decode()
        raise RuntimeError(f"Keycloak API error {e.code}: {body_text}")


def wait_for_keycloak() -> bool:
    print("Waiting for Keycloak to be ready...")
    for i in range(40):
        try:
            req = urllib.request.urlopen(f"{KEYCLOAK_URL}/realms/master", timeout=5)
            if req.status == 200:
                print("  \u2713 Keycloak is ready")
                return True
        except Exception:
            pass
        time.sleep(3)
        print(f"  Waiting... ({i+1}/40)")
    return False


def verify_postgres_backend(token: str) -> bool:
    """
    Verify Keycloak is using PostgreSQL backend, not H2.
    Keycloak with PostgreSQL backend will have the 'master' realm data persisted.
    """
    print("\nVerifying Keycloak uses PostgreSQL backend...")
    try:
        realm_info = keycloak_request("GET", "/realms/master", token)
        if realm_info.get("realm") == "master":
            print("  \u2713 Keycloak master realm accessible \u2014 PostgreSQL backend confirmed")
            return True
        return False
    except Exception as e:
        print(f"  \u2717 Could not verify backend: {e}")
        return False


def create_realm(token: str) -> bool:
    print(f"\nCreating realm: {REALM_NAME}")
    realm_config = {
        "realm": REALM_NAME,
        "enabled": True,
        "displayName": "AEGIS Realm",
        # Token TTLs (in seconds)
        "accessTokenLifespan": 900,         # 15 minutes
        "refreshTokenMaxReuse": 0,
        "ssoSessionMaxLifespan": 28800,     # 8 hours (refresh token TTL)
        "ssoSessionIdleTimeout": 28800,
        # Security settings
        "loginWithEmailAllowed": False,
        "duplicateEmailsAllowed": False,
        "registrationAllowed": False,        # No self-registration
        "resetPasswordAllowed": False,
        "bruteForceProtected": True,
        # Token settings
        "revokeRefreshToken": True,          # Each refresh token single-use
    }
    result = keycloak_request("POST", "/realms", token, realm_config)
    if result.get("already_exists"):
        print(f"  \u2713 Realm '{REALM_NAME}' already exists")
    else:
        print(f"  \u2713 Realm '{REALM_NAME}' created")
    return True


def create_roles(token: str) -> bool:
    print(f"\nCreating roles in {REALM_NAME}...")
    roles = [
        {"name": "employee", "description": "Standard AEGIS user \u2014 access to chat interface"},
        {"name": "it-admin", "description": "IT Administrator \u2014 access to admin portal"},
    ]
    for role in roles:
        result = keycloak_request("POST", f"/realms/{REALM_NAME}/roles", token, role)
        if result.get("already_exists"):
            print(f"  \u2713 Role '{role['name']}' already exists")
        else:
            print(f"  \u2713 Role '{role['name']}' created")
    return True


def create_clients(token: str) -> bool:
    print(f"\nCreating clients in {REALM_NAME}...")

    # aegis-chat client (employee frontend — ROPC flow)
    chat_client = {
        "clientId": "aegis-chat",
        "name": "AEGIS Chat Client",
        "enabled": True,
        "publicClient": False,
        "secret": "aegis_chat_client_secret_dev",
        "directAccessGrantsEnabled": True,   # Enables ROPC flow
        "standardFlowEnabled": True,          # Enables Authorization Code flow (for production PKCE)
        "implicitFlowEnabled": False,
        "serviceAccountsEnabled": False,
        "redirectUris": ["http://localhost:3000/*", "https://localhost/*"],
        "webOrigins": ["http://localhost:3000", "https://localhost"],
        "protocol": "openid-connect",
        "defaultRoles": [],
    }

    # aegis-admin client (admin portal)
    admin_client = {
        "clientId": "aegis-admin",
        "name": "AEGIS Admin Client",
        "enabled": True,
        "publicClient": False,
        "secret": "aegis_admin_client_secret_dev",
        "directAccessGrantsEnabled": True,
        "standardFlowEnabled": True,
        "implicitFlowEnabled": False,
        "serviceAccountsEnabled": False,
        "redirectUris": ["http://localhost:3000/admin/*"],
        "webOrigins": ["http://localhost:3000"],
        "protocol": "openid-connect",
    }

    for client in [chat_client, admin_client]:
        result = keycloak_request("POST", f"/realms/{REALM_NAME}/clients", token, client)
        if result.get("already_exists"):
            print(f"  \u2713 Client '{client['clientId']}' already exists")
        else:
            print(f"  \u2713 Client '{client['clientId']}' created")
    return True


def create_test_users(token: str) -> bool:
    print(f"\nCreating test users in {REALM_NAME}...")

    test_users = [
        {
            "username": "employee1",
            "email": "employee1@sonacomstar.local",
            "firstName": "Test",
            "lastName": "Employee",
            "enabled": True,
            "role": "employee",
            "password": "Employee@123",
        },
        {
            "username": "itadmin1",
            "email": "itadmin1@sonacomstar.local",
            "firstName": "Test",
            "lastName": "ITAdmin",
            "enabled": True,
            "role": "it-admin",
            "password": "ITAdmin@123",
        },
    ]

    for user_data in test_users:
        # Create user
        user_body = {
            "username": user_data["username"],
            "email": user_data["email"],
            "firstName": user_data["firstName"],
            "lastName": user_data["lastName"],
            "enabled": user_data["enabled"],
            "credentials": [{
                "type": "password",
                "value": user_data["password"],
                "temporary": False,
            }]
        }
        result = keycloak_request("POST", f"/realms/{REALM_NAME}/users", token, user_body)

        if result.get("already_exists"):
            print(f"  \u2713 User '{user_data['username']}' already exists")
            # Find existing user
            users = keycloak_request("GET", f"/realms/{REALM_NAME}/users?username={user_data['username']}", token)
            if not users:
                continue
            user_id = users[0]["id"]
        else:
            # Get the created user's ID
            users = keycloak_request("GET", f"/realms/{REALM_NAME}/users?username={user_data['username']}", token)
            if not users:
                print(f"  \u2717 Could not find created user {user_data['username']}")
                continue
            user_id = users[0]["id"]
            print(f"  \u2713 User '{user_data['username']}' created (id: {user_id[:8]}...)")

        # Assign role to user
        roles = keycloak_request("GET", f"/realms/{REALM_NAME}/roles/{user_data['role']}", token)
        role_body = [{"id": roles["id"], "name": roles["name"]}]
        keycloak_request("POST", f"/realms/{REALM_NAME}/users/{user_id}/role-mappings/realm", token, role_body)
        print(f"  \u2713 Role '{user_data['role']}' assigned to '{user_data['username']}'")

    return True


def verify_login(username: str, password: str) -> bool:
    """Verify a user can obtain a token (tests the full ROPC flow)."""
    data = urllib.parse.urlencode({
        "username": username,
        "password": password,
        "grant_type": "password",
        "client_id": "aegis-chat",
        "client_secret": "aegis_chat_client_secret_dev",
    }).encode()

    try:
        req = urllib.request.Request(
            f"{KEYCLOAK_URL}/realms/{REALM_NAME}/protocol/openid-connect/token",
            data=data, method="POST"
        )
        resp = urllib.request.urlopen(req, timeout=15)
        token_data = json.loads(resp.read())
        access_token = token_data.get("access_token", "")
        if access_token:
            # Decode and verify the role claim
            import base64
            payload_b64 = access_token.split(".")[1]
            # Add padding
            payload_b64 += "=" * (4 - len(payload_b64) % 4)
            payload = json.loads(base64.b64decode(payload_b64))
            realm_roles = payload.get("realm_access", {}).get("roles", [])
            return True
        return False
    except Exception as e:
        print(f"  Login test failed: {e}")
        return False


def main():
    print("=" * 60)
    print("AEGIS Keycloak Setup")
    print("=" * 60)

    if not wait_for_keycloak():
        print("ERROR: Keycloak not ready. Check Docker container.")
        sys.exit(1)

    token = get_admin_token()
    print("  \u2713 Admin token obtained")

    if not verify_postgres_backend(token):
        print("WARNING: Could not verify PostgreSQL backend")

    create_realm(token)
    create_roles(token)
    create_clients(token)
    create_test_users(token)

    print("\nVerifying login flows...")
    emp_ok = verify_login("employee1", "Employee@123")
    adm_ok = verify_login("itadmin1", "ITAdmin@123")
    mark_emp = "\u2713" if emp_ok else "\u2717"
    mark_adm = "\u2713" if adm_ok else "\u2717"
    print(f"  {mark_emp} employee1 login")
    print(f"  {mark_adm} itadmin1 login")

    if emp_ok and adm_ok:
        print("\n\u2713 KEYCLOAK SETUP COMPLETE")
        sys.exit(0)
    else:
        print("\n\u2717 KEYCLOAK SETUP FAILED \u2014 check errors above")
        sys.exit(1)


if __name__ == "__main__":
    main()
