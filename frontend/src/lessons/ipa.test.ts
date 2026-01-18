import { describe, expect, it } from "vitest";
import { extractIpaSymbols, toIpa } from "./ipa";

describe("extractIpaSymbols", () => {
  it("extracts known symbols from an IPA string", () => {
    const found = extractIpaSymbols("/haɪ aɪm ˈænə/");
    expect(found.has("h")).toBe(true);
    expect(found.has("ˈ")).toBe(true);
    expect(found.has("æ")).toBe(true);
    expect(found.has("ə")).toBe(true);
  });

  it("prefers affricates over sub-symbol matches", () => {
    const found = extractIpaSymbols("/tʃeə/");
    expect(found.has("tʃ")).toBe(true);
    expect(found.has("ʃ")).toBe(false);
  });
});

describe("toIpa", () => {
  it("returns a slash-wrapped IPA string for simple phrases", () => {
    const ipa = toIpa("Nice to meet you too.");
    expect(ipa).toMatch(/^\/.*\/$/);
    expect(ipa.length).toBeGreaterThan(2);
  });
});
