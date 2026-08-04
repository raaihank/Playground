// Single shared access code (spec §12). Not real auth — enough while it's only you
// and a handful of cadre reviewers. The cookie value is checked against ACCESS_CODE.
export const ACCESS_COOKIE = "bcs_access";

export function expectedAccessCode(): string | undefined {
  return process.env.ACCESS_CODE;
}

export function isAuthorized(cookieValue: string | undefined): boolean {
  const expected = expectedAccessCode();
  // If no code is configured, fail closed rather than open.
  if (!expected) return false;
  return cookieValue === expected;
}
