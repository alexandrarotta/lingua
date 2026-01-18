import { describe, expect, it } from "vitest";
import { diffTokens } from "../src/pronunciation/diffTokens.js";

describe("diffTokens", () => {
  it("marks ok and missing tokens", () => {
    const tokens = diffTokens("I want to go", "I want go");
    expect(tokens.map((t) => t.status)).toEqual(["ok", "ok", "missing", "ok"]);
  });

  it("marks extras", () => {
    const tokens = diffTokens("I go home", "I go to home");
    expect(tokens.some((t) => t.status === "extra")).toBe(true);
  });
});

