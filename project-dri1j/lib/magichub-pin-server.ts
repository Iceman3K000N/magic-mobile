import { pbkdf2Sync, randomBytes, timingSafeEqual } from "node:crypto";

const PBKDF2_ITERS = 120_000;
const KEYLEN = 32;
const DIGEST = "sha256";

/** Format: pbkdf2$<salt_hex>$<hash_hex> */
export function hashManagerPin(pin: string): string {
  const salt = randomBytes(16);
  const hash = pbkdf2Sync(pin, salt, PBKDF2_ITERS, KEYLEN, DIGEST);
  return `pbkdf2$${salt.toString("hex")}$${hash.toString("hex")}`;
}

export function verifyManagerPin(pin: string, stored: string): boolean {
  const parts = stored.split("$");
  if (parts.length !== 3 || parts[0] !== "pbkdf2") return false;
  try {
    const salt = Buffer.from(parts[1], "hex");
    const expected = Buffer.from(parts[2], "hex");
    const actual = pbkdf2Sync(pin, salt, PBKDF2_ITERS, KEYLEN, DIGEST);
    return expected.length === actual.length && timingSafeEqual(expected, actual);
  } catch {
    return false;
  }
}

export function normalizeFourDigitPin(raw: string): string | null {
  const d = raw.replace(/\D/g, "").slice(0, 4);
  return d.length === 4 ? d : null;
}
