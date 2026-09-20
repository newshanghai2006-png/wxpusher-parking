import assert from "node:assert/strict";
import test from "node:test";
import {
  ApiError,
  decryptToken,
  encryptToken,
  normalizeCooldown,
  validateCardInput,
} from "../src/helpers.js";

test("validates and normalizes card input", () => {
  const value = validateCardInput({
    uid: " UID_12345678 ",
    appToken: " AT_1234567890123456 ",
    title: " 请挪车 ",
    note: " 谢谢 ",
    theme: "blue",
    style: "bold",
  });
  assert.deepEqual(value, {
    uid: "UID_12345678",
    appToken: "AT_1234567890123456",
    title: "请挪车",
    note: "谢谢",
    theme: "blue",
    style: "bold",
  });
});

test("rejects malformed credentials", () => {
  assert.throws(
    () => validateCardInput({ uid: "bad", appToken: "bad", title: "x", note: "x" }),
    ApiError,
  );
});

test("encrypts and decrypts the app token", async () => {
  const secret = "a-long-test-encryption-key";
  const encrypted = await encryptToken("AT_1234567890123456", secret);
  assert.notEqual(encrypted.encryptedToken, "AT_1234567890123456");
  assert.equal(
    await decryptToken(encrypted.encryptedToken, encrypted.iv, secret),
    "AT_1234567890123456",
  );
});

test("clamps notification cooldown", () => {
  assert.equal(normalizeCooldown("5"), 30);
  assert.equal(normalizeCooldown("120"), 120);
  assert.equal(normalizeCooldown("9999"), 3600);
  assert.equal(normalizeCooldown("invalid"), 60);
});
