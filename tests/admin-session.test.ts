import assert from "node:assert/strict";
import test from "node:test";
import {
  createSignedAdminSession,
  parseSignedAdminSession,
  verifySecret,
} from "../lib/admin-session";

test("admin session round trips with matching secret", () => {
  const token = createSignedAdminSession({
    actor: "admin",
    expiresAt: 2_000,
    secret: "secret-a",
  });
  assert.deepEqual(parseSignedAdminSession(token, "secret-a", 1_000), {
    actor: "admin",
    exp: 2_000,
  });
});

test("admin session rejects tampered or expired tokens", () => {
  const token = createSignedAdminSession({
    actor: "admin",
    expiresAt: 2_000,
    secret: "secret-a",
  });
  assert.equal(parseSignedAdminSession(`${token}x`, "secret-a", 1_000), null);
  assert.equal(parseSignedAdminSession(token, "secret-b", 1_000), null);
  assert.equal(parseSignedAdminSession(token, "secret-a", 3_000), null);
});

test("admin secret comparison is exact", () => {
  assert.equal(verifySecret("abc", "abc"), true);
  assert.equal(verifySecret("abc", "abcd"), false);
});
