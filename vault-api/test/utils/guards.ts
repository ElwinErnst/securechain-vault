export type AuthResponse = {
  accessToken: string;
  refreshToken: string;
};

export function isAuthResponse(x: unknown): x is AuthResponse {
  if (typeof x !== 'object' || x === null) return false;
  const r = x as Record<string, unknown>;
  return (
    typeof r.accessToken === 'string' && typeof r.refreshToken === 'string'
  );
}

export type TenantResponse = {
  id: string;
  slug: string;
  name: string;
};

export function isTenantResponse(x: unknown): x is TenantResponse {
  if (typeof x !== 'object' || x === null) return false;
  const r = x as Record<string, unknown>;
  return (
    typeof r.id === 'string' &&
    typeof r.slug === 'string' &&
    typeof r.name === 'string'
  );
}
