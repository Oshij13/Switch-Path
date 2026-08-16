import assert from "node:assert/strict";
import test from "node:test";

import { isPublicIpAddress, resolvePublicUrl } from "./url-safety.ts";

test("blocks local, credentialed, nonstandard, and private-network URLs", async () => {
  const publicResolver = async () => [{ address: "93.184.216.34", family: 4 as const }];
  await assert.rejects(() => resolvePublicUrl("http://localhost/admin", publicResolver), /local hostname/);
  await assert.rejects(() => resolvePublicUrl("https://user:pass@example.com", publicResolver), /credentials/);
  await assert.rejects(() => resolvePublicUrl("https://example.com:8443", publicResolver), /standard/);
  await assert.rejects(() => resolvePublicUrl("http://[::1]/admin", publicResolver), /blocked network/);
  await assert.rejects(
    () => resolvePublicUrl("https://metadata.example", async () => [{ address: "169.254.169.254", family: 4 }]),
    /blocked network/,
  );
});

test("requires every DNS answer to be public", async () => {
  await assert.rejects(
    () =>
      resolvePublicUrl("https://example.com", async () => [
        { address: "93.184.216.34", family: 4 },
        { address: "10.0.0.7", family: 4 },
      ]),
    /10\.0\.0\.7/,
  );
});

test("recognizes public and non-public IPv4 and IPv6 ranges", () => {
  assert.equal(isPublicIpAddress("8.8.8.8"), true);
  assert.equal(isPublicIpAddress("192.168.1.1"), false);
  assert.equal(isPublicIpAddress("::1"), false);
  assert.equal(isPublicIpAddress("fc00::1"), false);
  assert.equal(isPublicIpAddress("::ffff:127.0.0.1"), false);
  assert.equal(isPublicIpAddress("2606:4700:4700::1111"), true);
});

test("returns normalized public URL and approved DNS targets", async () => {
  const target = await resolvePublicUrl(
    "https://Example.COM/path?q=1",
    async () => [{ address: "93.184.216.34", family: 4 }],
  );
  assert.equal(target.url.href, "https://example.com/path?q=1");
  assert.equal(target.addresses[0]?.address, "93.184.216.34");
});
