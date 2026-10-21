import { timingSafeEqual } from "node:crypto";

/** Constant-time comparison for the internal scheduler credential. */
export function isAuthorizedVideoSchedulerRequest(authorization: string | null, expectedSecret: string | undefined) {
  if (!expectedSecret || !authorization?.startsWith("Bearer ")) return false;
  const supplied = Buffer.from(authorization.slice("Bearer ".length));
  const expected = Buffer.from(expectedSecret);
  return supplied.length === expected.length && timingSafeEqual(supplied, expected);
}
