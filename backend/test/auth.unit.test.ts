import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "../src/auth/password.js";
import { randomToken, sha256Hex } from "../src/auth/tokens.js";

describe("auth utils", () => {
  it("hashPassword + verifyPassword", async () => {
    const hash = await hashPassword("Correct Horse Battery Staple");
    expect(hash).toMatch(/\$2[aby]\$/); // bcrypt format
    expect(await verifyPassword("Correct Horse Battery Staple", hash)).toBe(true);
    expect(await verifyPassword("wrong", hash)).toBe(false);
  });

  it("sha256Hex is stable", () => {
    const token = randomToken(16);
    expect(sha256Hex(token)).toBe(sha256Hex(token));
    expect(sha256Hex(token)).not.toBe(sha256Hex(token + "x"));
  });
});

