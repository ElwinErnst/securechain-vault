BEGIN;

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Roles (idempotente)
INSERT INTO roles (name)
VALUES ('ADMIN'), ('USER'), ('AUDITOR')
ON CONFLICT (name) DO NOTHING;

-- Admin user (idempotente)
INSERT INTO users (email, password_hash, is_active)
VALUES ('admin@vault.local', '$argon2id$v=19$m=65536,t=3,p=4$JPKQGrotVcCKz8hP3iADhQ$ceOPMSt6a8yHELvchWB7aG92ZHLRDh9LJCdP3Oqv9GI', true)
ON CONFLICT (email) DO NOTHING;

-- Demo identities mirrored from auth-api seed for end-to-end local testing
INSERT INTO users (id, email, password_hash, is_active)
VALUES (
  '925df4a7-ab30-4619-b2d5-7de62af7af6c',
  'admin@test.com',
  '$2b$12$zXfv6NQXkT3f0SR1g4aQVuF9g7M7wQw0pU0ZyqG0F0b3mM6A5nLQm',
  true
)
ON CONFLICT (email) DO NOTHING;

INSERT INTO tenants (id, name, slug, type, owner_user_id)
VALUES (
  'f4acaa72-d090-4cfb-9430-4f8585f58d86',
  'Sentinel Labs',
  'sentinel-labs',
  'ORG',
  '925df4a7-ab30-4619-b2d5-7de62af7af6c'
)
ON CONFLICT (slug) DO NOTHING;

INSERT INTO tenant_members (tenant_id, user_id, role)
VALUES (
  'f4acaa72-d090-4cfb-9430-4f8585f58d86',
  '925df4a7-ab30-4619-b2d5-7de62af7af6c',
  'OWNER'
)
ON CONFLICT ON CONSTRAINT uq_tenant_members_tenant_user DO NOTHING;

INSERT INTO vaults (tenant_id, name, slug, is_default)
VALUES (
  'f4acaa72-d090-4cfb-9430-4f8585f58d86',
  'Sentinel Labs Vault',
  'sentinel-labs-vault',
  true
)
ON CONFLICT ON CONSTRAINT uq_vaults_tenant_slug DO NOTHING;

-- Vincular ADMIN al admin (idempotente por uq_user_roles)
INSERT INTO user_roles (user_id, role_id)
SELECT u.id, r.id
FROM users u
JOIN roles r ON r.name = 'ADMIN'
WHERE u.email = 'admin@vault.local'
ON CONFLICT ON CONSTRAINT uq_user_roles DO NOTHING;

COMMIT;
