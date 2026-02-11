BEGIN;

-- Refresh tokens (rotación + reuse detection)
CREATE TABLE IF NOT EXISTS refresh_tokens (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  -- “familia” = cadena de rotación por dispositivo/sesión
  family_id uuid NOT NULL DEFAULT uuid_generate_v4(),

  -- jti del JWT refresh
  jti uuid NOT NULL UNIQUE,

  -- hash del token (nunca guardar token plano)
  token_hash varchar(64) NOT NULL,

  -- tracking de rotación
  replaced_by uuid NULL REFERENCES refresh_tokens(id) ON DELETE SET NULL,
  revoked_at timestamptz NULL,

  -- metadata opcional (útil más adelante)
  user_agent text NULL,
  ip inet NULL,

  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user_id ON refresh_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_family_id ON refresh_tokens(family_id);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_expires_at ON refresh_tokens(expires_at);

COMMIT;
