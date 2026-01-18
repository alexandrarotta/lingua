import { describe, expect, it } from "vitest";
import { getTopicsForLevel } from "./topics";

describe("getTopicsForLevel", () => {
  it("returns only topics for selected level", () => {
    const lessons = [
      { level: "A1", topic: "Travel" },
      { level: "A1", topic: "Food" },
      { level: "A2", topic: "Work" }
    ] as const;

    expect(getTopicsForLevel(lessons, "A1")).toEqual(["Food", "Travel"]);
    expect(getTopicsForLevel(lessons, "A2")).toEqual(["Work"]);
  });

  it("dedupes case-insensitively and sorts alphabetically", () => {
    const lessons = [
      { level: "A1", topic: "  travel  " },
      { level: "A1", topic: "Travel" },
      { level: "A1", topic: "food" },
      { level: "A1", topic: "Food" }
    ] as const;

    expect(getTopicsForLevel(lessons, "A1")).toEqual(["food", "travel"]);
  });
});

