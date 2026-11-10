import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { decryptSecret, encryptSecret, maskPassword } from "./crypto.js";

describe("crypto", () => {
  const key = Buffer.from(
    "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
    "hex",
  );

  it("round-trips secrets", () => {
    const cipher = encryptSecret("s3cret!", key);
    assert.notEqual(cipher, "s3cret!");
    assert.equal(decryptSecret(cipher, key), "s3cret!");
  });

  it("produces different ciphertext each call (IV)", () => {
    const a = encryptSecret("same", key);
    const b = encryptSecret("same", key);
    assert.notEqual(a, b);
  });

  it("masks passwords for UI", () => {
    assert.equal(maskPassword(true), "••••••••");
    assert.equal(maskPassword(false), "");
  });
});
