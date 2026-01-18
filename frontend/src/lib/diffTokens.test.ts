import { describe, expect, it } from "vitest";
import { diffTokens } from "./diffTokens";

describe("diffTokens (frontend)", () => {
  it("aligns tokens", () => {
    const t = diffTokens("I want to go", "I want go");
    expect(t.map((x) => x.status)).toEqual(["ok", "ok", "missing", "ok"]);
  });
});

