-- Create the keycloak database for Keycloak to use
-- This runs automatically on first PostgreSQL initialization
SELECT 'CREATE DATABASE keycloak'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'keycloak')\gexec
