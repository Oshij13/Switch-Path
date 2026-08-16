import "server-only";

import type { ChatGPTUser } from "./chatgpt-auth";
import { createApiSessionToken } from "../../../packages/shared/src/api-session";

export function createSwitchpathApiSession(user: ChatGPTUser): string {
  const secret = process.env.SWITCHPATH_INTERNAL_AUTH_SECRET?.trim();
  if (!secret) throw new Error("SWITCHPATH_INTERNAL_AUTH_SECRET is required when authentication is enabled");
  return createApiSessionToken({
    sub: user.userId,
    email: user.email,
    name: user.displayName,
  }, secret, Math.floor(Date.now() / 1000) + 60 * 60 * 8);
}
