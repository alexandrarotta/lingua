import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import PronunciationTokens from "./PronunciationTokens";

describe("PronunciationTokens", () => {
  it("renders tokens", () => {
    render(
      <PronunciationTokens
        tokens={[
          { status: "ok", expected: "I", actual: "I" },
          { status: "missing", expected: "to" },
          { status: "extra", actual: "really" },
          { status: "substituted", expected: "go", actual: "gone" }
        ]}
      />
    );
    expect(screen.getByLabelText("pronunciation-tokens")).toBeTruthy();
    expect(screen.getByText("I")).toBeTruthy();
    expect(screen.getByText("to")).toBeTruthy();
    expect(screen.getByText("+really")).toBeTruthy();
    expect(screen.getByText("go(gone)")).toBeTruthy();
  });
});

