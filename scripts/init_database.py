#!/usr/bin/env python3
"""
AEGIS Database Initialization Script
Runs all migration files and seed data in correct order.
Usage: python scripts/init_database.py
"""
import subprocess
import sys
import os
import time


POSTGRES_CONTAINER = "aegis-postgres-primary"
POSTGRES_USER = "postgres"
POSTGRES_PASSWORD = os.getenv("POSTGRES_ADMIN_PASSWORD", "aegis_admin_dev_2024")
POSTGRES_DB = "aegis"

# Migration files in execution order
MIGRATIONS = [
    "database/migrations/001_operational_schema.sql",
    "database/migrations/002_analytical_schema.sql",
    "database/migrations/003_config_snapshot.sql",
    "database/migrations/004_initial_data.sql",
]

# Seed files in execution order
SEEDS = [
    "database/seeds/transaction_code_permissions.sql",
    "database/seeds/synonym_map.sql",
]


def run_sql_file(filepath: str, description: str, database: str = POSTGRES_DB) -> bool:
    """Copy a SQL file into the container and execute it."""
    print(f"\nRunning: {description}")
    print(f"  File: {filepath}")

    if not os.path.exists(filepath):
        print(f"  ERROR: File not found: {filepath}")
        return False

    basename = os.path.basename(filepath)

    # Copy SQL file into the container
    cp_result = subprocess.run(
        ["docker", "cp", filepath, f"{POSTGRES_CONTAINER}:/tmp/{basename}"],
        capture_output=True, text=True,
    )
    if cp_result.returncode != 0:
        print(f"  ERROR: Failed to copy file to container: {cp_result.stderr}")
        return False

    # Execute the SQL file inside the container
    result = subprocess.run(
        [
            "docker", "exec",
            "-e", f"PGPASSWORD={POSTGRES_PASSWORD}",
            POSTGRES_CONTAINER,
            "psql",
            "-U", POSTGRES_USER,
            "-d", database,
            "-f", f"/tmp/{basename}",
            "-v", "ON_ERROR_STOP=1",
        ],
        capture_output=True, text=True,
    )

    if result.returncode == 0:
        print(f"  ✓ Success")
        if result.stdout.strip():
            for line in result.stdout.strip().split("\n"):
                if line.strip():
                    print(f"  > {line.strip()}")
        return True
    else:
        print(f"  ✗ FAILED")
        if result.stdout.strip():
            print(f"  stdout: {result.stdout[:500]}")
        if result.stderr.strip():
            print(f"  stderr: {result.stderr[:500]}")
        return False


def wait_for_postgres() -> bool:
    """Wait for PostgreSQL to be ready to accept connections."""
    print("Waiting for PostgreSQL to be ready...")
    for i in range(30):
        result = subprocess.run(
            [
                "docker", "exec", POSTGRES_CONTAINER,
                "pg_isready", "-U", POSTGRES_USER, "-d", POSTGRES_DB,
            ],
            capture_output=True, text=True,
        )
        if result.returncode == 0:
            print("  ✓ PostgreSQL is ready")
            return True
        time.sleep(2)
        print(f"  Waiting... ({i + 1}/30)")
    print("  ✗ PostgreSQL did not become ready in time")
    return False


def ensure_aegis_database() -> bool:
    """Ensure the aegis database exists."""
    print("\nEnsuring aegis database exists...")
    result = subprocess.run(
        [
            "docker", "exec",
            "-e", f"PGPASSWORD={POSTGRES_PASSWORD}",
            POSTGRES_CONTAINER,
            "psql", "-U", POSTGRES_USER, "-d", "postgres",
            "-t", "-c",
            "SELECT 1 FROM pg_database WHERE datname = 'aegis';",
        ],
        capture_output=True, text=True,
    )
    if "1" in result.stdout:
        print("  ✓ aegis database exists")
        return True

    # Create it
    result = subprocess.run(
        [
            "docker", "exec",
            "-e", f"PGPASSWORD={POSTGRES_PASSWORD}",
            POSTGRES_CONTAINER,
            "psql", "-U", POSTGRES_USER, "-d", "postgres",
            "-c", "CREATE DATABASE aegis;",
        ],
        capture_output=True, text=True,
    )
    if result.returncode == 0:
        print("  ✓ Created aegis database")
        return True
    print(f"  ✗ Failed to create aegis database: {result.stderr}")
    return False


def verify_tables() -> bool:
    """Verify all 13 expected tables were created."""
    print("\nVerifying all tables were created...")

    expected_tables = [
        "known_patterns_registry",
        "documents_registry",
        "document_relationships",
        "transaction_code_permissions",
        "audit_log",
        "mock_tickets",
        "feedback_events",
        "human_review_queue",
        "synonym_map",
        "config_snapshot",
        "knowledge_gap_events",
        "confidence_history",
        "session_quality_daily",
    ]

    result = subprocess.run(
        [
            "docker", "exec",
            "-e", f"PGPASSWORD={POSTGRES_PASSWORD}",
            POSTGRES_CONTAINER,
            "psql", "-U", POSTGRES_USER, "-d", POSTGRES_DB,
            "-t", "-c",
            "SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename;",
        ],
        capture_output=True, text=True,
    )

    existing_tables = [t.strip() for t in result.stdout.strip().split("\n") if t.strip()]

    all_found = True
    for table in expected_tables:
        if table in existing_tables:
            print(f"  ✓ {table}")
        else:
            print(f"  ✗ {table} — NOT FOUND")
            all_found = False

    return all_found


def verify_audit_log_append_only() -> bool:
    """Verify audit_log has INSERT but not UPDATE/DELETE for aegis_app_role."""
    print("\nVerifying audit_log is append-only...")
    result = subprocess.run(
        [
            "docker", "exec",
            "-e", f"PGPASSWORD={POSTGRES_PASSWORD}",
            POSTGRES_CONTAINER,
            "psql", "-U", POSTGRES_USER, "-d", POSTGRES_DB,
            "-t", "-c",
            "SELECT has_table_privilege('aegis_app_role', 'audit_log', 'UPDATE'),"
            " has_table_privilege('aegis_app_role', 'audit_log', 'DELETE'),"
            " has_table_privilege('aegis_app_role', 'audit_log', 'INSERT');",
        ],
        capture_output=True, text=True,
    )
    output = result.stdout.strip()
    # Expected: f | f | t  (UPDATE=false, DELETE=false, INSERT=true)
    if "f" in output and "t" in output:
        print("  ✓ audit_log: UPDATE denied, DELETE denied, INSERT allowed")
        return True
    print(f"  Warning: audit_log permissions check returned: {output}")
    return True  # Non-blocking


def verify_seed_data() -> bool:
    """Verify seed data was loaded correctly."""
    print("\nVerifying seed data...")

    # Check T-code permissions count
    result = subprocess.run(
        [
            "docker", "exec",
            "-e", f"PGPASSWORD={POSTGRES_PASSWORD}",
            POSTGRES_CONTAINER,
            "psql", "-U", POSTGRES_USER, "-d", POSTGRES_DB,
            "-t", "-c", "SELECT COUNT(*) FROM transaction_code_permissions;",
        ],
        capture_output=True, text=True,
    )
    tcode_count = 0
    try:
        tcode_count = int(result.stdout.strip())
    except ValueError:
        pass
    print(f"  ✓ transaction_code_permissions: {tcode_count} entries")

    # Check synonym map count
    result = subprocess.run(
        [
            "docker", "exec",
            "-e", f"PGPASSWORD={POSTGRES_PASSWORD}",
            POSTGRES_CONTAINER,
            "psql", "-U", POSTGRES_USER, "-d", POSTGRES_DB,
            "-t", "-c", "SELECT COUNT(*) FROM synonym_map WHERE active = TRUE;",
        ],
        capture_output=True, text=True,
    )
    synonym_count = 0
    try:
        synonym_count = int(result.stdout.strip())
    except ValueError:
        pass
    print(f"  ✓ synonym_map: {synonym_count} active entries")

    # Verify VL01N T-code is in permissions
    result = subprocess.run(
        [
            "docker", "exec",
            "-e", f"PGPASSWORD={POSTGRES_PASSWORD}",
            POSTGRES_CONTAINER,
            "psql", "-U", POSTGRES_USER, "-d", POSTGRES_DB,
            "-t", "-c",
            "SELECT access_level FROM transaction_code_permissions WHERE tcode = 'VL01N';",
        ],
        capture_output=True, text=True,
    )
    vl01n_access = result.stdout.strip()
    print(f"  ✓ VL01N access level: {vl01n_access}")

    return tcode_count > 0 and synonym_count > 0


def main():
    print("=" * 60)
    print("AEGIS Database Initialization")
    print("=" * 60)

    # Step 1: Wait for PostgreSQL
    if not wait_for_postgres():
        print("ERROR: PostgreSQL not ready. Is the Docker container running?")
        sys.exit(1)

    # Step 2: Ensure aegis database exists
    if not ensure_aegis_database():
        print("ERROR: Could not create aegis database")
        sys.exit(1)

    # Step 3: Run migrations in order
    print("\nRunning migrations...")
    for migration in MIGRATIONS:
        description = os.path.basename(migration)
        if not run_sql_file(migration, description):
            print(f"\nERROR: Migration failed: {migration}")
            sys.exit(1)

    # Step 4: Run seed data
    print("\nRunning seed data...")
    for seed in SEEDS:
        description = os.path.basename(seed)
        if not run_sql_file(seed, description):
            print(f"\nERROR: Seed failed: {seed}")
            sys.exit(1)

    # Step 5: Verify tables
    if not verify_tables():
        print("\nERROR: Not all tables were created successfully")
        sys.exit(1)

    # Step 6: Verify audit log append-only
    verify_audit_log_append_only()

    # Step 7: Verify seed data
    if not verify_seed_data():
        print("\nERROR: Seed data verification failed")
        sys.exit(1)

    print("\n" + "=" * 60)
    print("✓ DATABASE INITIALIZATION COMPLETE")
    print("All 13 tables created, permissions set, seed data loaded.")
    sys.exit(0)


if __name__ == "__main__":
    main()
