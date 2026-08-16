import assert from "node:assert/strict";
import test from "node:test";

import { createApiSessionToken, verifyApiSessionToken } from "./api-session.ts";

const secret = "switchpath-test-secret-with-at-least-32-characters";
const identity = { sub: "user-1", email: "ae@example.com", name: "Account Executive" };

test("round-trips a signed workspace identity", () => {
  const token = createApiSessionToken(identity, secret, 2_000);
  assert.deepEqual(verifyApiSessionToken(token, secret, 1_000), { ...identity, exp: 2_000 });
});

test("rejects tampered and expired sessions", () => {
  const token = createApiSessionToken(identity, secret, 2_000);
  assert.throws(() => verifyApiSessionToken(`${token}x`, secret, 1_000), /signature/);
  assert.throws(() => verifyApiSessionToken(token, secret, 2_000), /expired/);
});

test("requires a production-strength shared secret", () => {
  assert.throws(() => createApiSessionToken(identity, "short", 2_000), /at least 32/);
});
