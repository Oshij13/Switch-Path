import "server-only";
import { createHmac } from "node:crypto";
import type { ChatGPTUser } from "./chatgpt-auth";

export function createSwitchpathApiSession(user: ChatGPTUser): string {
  const secret = process.env.SWITCHPATH_INTERNAL_AUTH_SECRET?.trim();
  if (!secret) throw new Error("SWITCHPATH_INTERNAL_AUTH_SECRET is required when authentication is enabled");
  return createApiSessionToken(
    {
      sub: user.userId,
      email: user.email,
      name: user.displayName,
    },
    secret,
    Math.floor(Date.now() / 1000) + 60 * 60 * 8,
  );
}

function createApiSessionToken(
  identity: { sub: string; email: string; name: string },
  secret: string,
  expiresAtEpochSeconds: number,
): string {
  if (secret.trim().length < 32) {
    throw new Error("SWITCHPATH_INTERNAL_AUTH_SECRET must contain at least 32 characters");
  }
  const payload = Buffer.from(
    JSON.stringify({ ...identity, exp: expiresAtEpochSeconds }),
  ).toString("base64url");
  const signature = createHmac("sha256", secret).update(payload).digest("base64url");
  return `${payload}.${signature}`;
}
