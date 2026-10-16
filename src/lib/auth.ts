// One shared password via HTTP Basic auth. No APP_PASSWORD set → open (local dev).
export function isAuthorized(header: string | null, password: string | undefined): boolean {
  if (!password) return true;
  if (!header?.startsWith("Basic ")) return false;
  let decoded: string;
  try {
    decoded = atob(header.slice(6).trim());
  } catch {
    return false;
  }
  const given = decoded.slice(decoded.indexOf(":") + 1);
  if (given.length !== password.length) return false;
  let diff = 0; // constant-time compare
  for (let i = 0; i < given.length; i++) diff |= given.charCodeAt(i) ^ password.charCodeAt(i);
  return diff === 0;
}
