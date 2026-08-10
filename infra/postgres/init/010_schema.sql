BEGIN;

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS roles (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  name varchar(50) NOT NULL UNIQUE,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  email varchar(255) NOT NULL UNIQUE,
  password_hash varchar(255) NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS user_roles (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role_id uuid NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_user_roles UNIQUE (user_id, role_id)
);

CREATE INDEX IF NOT EXISTS idx_user_roles_user_id ON user_roles(user_id);
CREATE INDEX IF NOT EXISTS idx_user_roles_role_id ON user_roles(role_id);

CREATE TABLE IF NOT EXISTS tenants (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  name varchar(120) NOT NULL,
  slug varchar(80) NOT NULL UNIQUE,
  type varchar(20) NOT NULL DEFAULT 'ORG',
  owner_user_id uuid NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS tenant_members (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  role varchar(20) NOT NULL DEFAULT 'MEMBER',
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_tenant_members_tenant_user UNIQUE (tenant_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_tenant_members_tenant_id ON tenant_members(tenant_id);
CREATE INDEX IF NOT EXISTS idx_tenant_members_user_id ON tenant_members(user_id);

CREATE TABLE IF NOT EXISTS vaults (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name varchar(120) NOT NULL,
  slug varchar(120) NOT NULL,
  is_default boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_vaults_tenant_slug UNIQUE (tenant_id, slug)
);

CREATE INDEX IF NOT EXISTS idx_vaults_tenant_id ON vaults(tenant_id);

CREATE TABLE IF NOT EXISTS tenant_keys (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  version int NOT NULL DEFAULT 1,
  encrypted_dek_b64 text NOT NULL,
  dek_iv_b64 text NOT NULL,
  dek_tag_b64 text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_tenant_keys_tenant_version UNIQUE (tenant_id, version)
);

CREATE TABLE IF NOT EXISTS documents (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  vault_id uuid NOT NULL REFERENCES vaults(id) ON DELETE CASCADE,
  original_name varchar(255) NOT NULL,
  stored_name varchar(255) NOT NULL,
  mime varchar(150) NOT NULL,
  size_bytes bigint NOT NULL,
  storage_key varchar(500) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  enc_alg varchar(40) NOT NULL DEFAULT 'AES-256-GCM',
  enc_iv_b64 text NULL,
  enc_tag_b64 text NULL,
  enc_key_version int NOT NULL DEFAULT 1,
  sha256_plain_hex char(64) NOT NULL,
  sha256_cipher_hex char(64) NULL,
  anchor_status varchar(20) NOT NULL DEFAULT 'PENDING',
  anchored_at timestamptz NULL,
  anchor_retries int NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_documents_tenant_vault_created_at
  ON documents(tenant_id, vault_id, created_at);
CREATE UNIQUE INDEX IF NOT EXISTS idx_documents_tenant_id_id
  ON documents(tenant_id, id);

CREATE TABLE IF NOT EXISTS audit_logs (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id uuid NULL REFERENCES tenants(id) ON DELETE SET NULL,
  user_id uuid NULL,
  scope varchar(64) NOT NULL,
  seq bigint NOT NULL,
  action varchar(80) NOT NULL,
  resource_type varchar(60) NOT NULL,
  resource_id varchar(120) NULL,
  outcome varchar(10) NOT NULL,
  http_status int NOT NULL,
  http_method varchar(10) NOT NULL,
  http_path varchar(255) NOT NULL,
  ip inet NULL,
  user_agent varchar(255) NULL,
  metadata jsonb NULL,
  event_hash char(64) NOT NULL,
  prev_hash char(64) NULL,
  chain_hash char(64) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_audit_logs_scope_seq
  ON audit_logs(scope, seq);
CREATE INDEX IF NOT EXISTS idx_audit_logs_tenant_created_at
  ON audit_logs(tenant_id, created_at);
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_created_at
  ON audit_logs(user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_audit_logs_resource_created_at
  ON audit_logs(resource_type, resource_id, created_at);

COMMIT;
