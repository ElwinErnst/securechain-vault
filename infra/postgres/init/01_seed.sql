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

-- Vincular ADMIN al admin (idempotente por uq_user_roles)
INSERT INTO user_roles (user_id, role_id)
SELECT u.id, r.id
FROM users u
JOIN roles r ON r.name = 'ADMIN'
WHERE u.email = 'admin@vault.local'
ON CONFLICT ON CONSTRAINT uq_user_roles DO NOTHING;

COMMIT;
