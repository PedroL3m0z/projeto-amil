/** Nome do cookie httpOnly onde o JWT de acesso é guardado. */
export const ACCESS_TOKEN_COOKIE = 'access_token';

export function getJwtSecret(): string {
  return (
    process.env.JWT_SECRET ?? 'dev-jwt-secret-defina-JWT_SECRET-fora-de-dev'
  );
}
