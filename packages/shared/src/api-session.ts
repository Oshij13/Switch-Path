import { createHmac, timingSafeEqual } from "node:crypto";

export type ApiSessionIdentity = {
  sub: string;
  email: string;
  name: string;
};

export function createApiSessionToken(
  identity: ApiSessionIdentity,
  secret: string,
  expiresAtEpochSeconds: number,
): string {
  assertSecret(secret);
  assertIdentity(identity);
  if (!Number.isInteger(expiresAtEpochSeconds) || expiresAtEpochSeconds <= 0) {
    throw new Error("A valid session expiry is required");
  }
  const payload = Buffer.from(JSON.stringify({ ...identity, exp: expiresAtEpochSeconds })).toString("base64url");
  const signature = createHmac("sha256", secret).update(payload).digest("base64url");
  return `${payload}.${signature}`;
}

export function verifyApiSessionToken(
  token: string,
  secret: string,
  nowEpochSeconds = Math.floor(Date.now() / 1000),
): ApiSessionIdentity & { exp: number } {
  assertSecret(secret);
  const [encodedPayload, suppliedSignature, extra] = token.split(".");
  if (!encodedPayload || !suppliedSignature || extra) throw new Error("Invalid Switchpath session");
  const expectedSignature = createHmac("sha256", secret).update(encodedPayload).digest();
  const receivedSignature = Buffer.from(suppliedSignature, "base64url");
  if (receivedSignature.length !== expectedSignature.length || !timingSafeEqual(receivedSignature, expectedSignature)) {
    throw new Error("Invalid Switchpath session signature");
  }
  let decoded: unknown;
  try {
    decoded = JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf8"));
  } catch {
    throw new Error("Invalid Switchpath session payload");
  }
  if (!decoded || typeof decoded !== "object" || Array.isArray(decoded)) {
    throw new Error("Invalid Switchpath session payload");
  }
  const payload = decoded as Partial<ApiSessionIdentity> & { exp?: unknown };
  const identity = { sub: payload.sub ?? "", email: payload.email ?? "", name: payload.name ?? "" };
  assertIdentity(identity);
  if (!Number.isFinite(payload.exp) || Number(payload.exp) <= nowEpochSeconds) {
    throw new Error("Your Switchpath session has expired; sign in again");
  }
  return { ...identity, exp: Number(payload.exp) };
}

function assertSecret(secret: string): void {
  if (secret.trim().length < 32) throw new Error("SWITCHPATH_INTERNAL_AUTH_SECRET must contain at least 32 characters");
}

function assertIdentity(identity: ApiSessionIdentity): void {
  if (!identity.sub.trim() || !identity.email.trim() || !identity.name.trim()) {
    throw new Error("A complete Switchpath identity is required");
  }
}
