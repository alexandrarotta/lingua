import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

vi.mock("../state/AppState", () => {
  const db = {
    listLessonStepProgress: () => [],
    getLessonProgress: () => ({
      lessonId: "l1",
      status: "in_progress",
      startedAt: 0,
      completedAt: null,
      lastStepId: "repeat-1",
      scoreSummaryJson: "{}"
    }),
    ensureLessonStarted: () => undefined,
    setLessonLastStep: () => undefined,
    recordLessonStepAttempt: () => ({
      lessonId: "l1",
      stepId: "repeat-1",
      attempts: 0,
      bestScore: 0,
      lastAttemptAt: 0
    }),
    bumpPhraseLowAccuracy: () => undefined,
    bumpVocabWrong: () => undefined,
    setLessonCompleted: () => undefined,
    createSession: () => "s1",
    addMessage: () => undefined,
    listTopVocabStats: () => []
  };

  const state = {
    db,
    profiles: [
      {
        id: "p1",
        name: "Test",
        providerType: "LM_STUDIO_OPENAI_COMPAT",
        baseUrl: "",
        model: "",
        workspaceSlug: ""
      }
    ],
    activeProfileId: "p1",
    sessionApiKeys: {}
  };

  return {
    useAppState: () => state
  };
});

vi.mock("../lessons/catalog", () => {
  return {
    loadLesson: vi.fn(async () => ({
      id: "l1",
      titleEn: "Test",
      titleEs: "Prueba",
      level: "A1",
      topic: "Travel",
      estimatedMinutes: 5,
      objectives: ["Objetivo"],
      grammarFocus: "Focus",
      vocabList: [],
      dialogue: [],
      targetPhrases: [{ text: "Nice to meet you too." }],
      exercises: { multipleChoice: [], fillInTheBlank: [], reorderWords: [] },
      conversationScenario: { roleplayEn: "Roleplay", promptsEn: [] }
    }))
  };
});

describe("LessonRunner Repeat IPA", () => {
  it("shows IPA always and does not render IPA controls in Repeat", async () => {
    const { default: LessonRunnerPage } = await import("./LessonRunner");

    render(
      <MemoryRouter initialEntries={["/lessons/l1"]}>
        <Routes>
          <Route path="/lessons/:lessonId" element={<LessonRunnerPage />} />
        </Routes>
      </MemoryRouter>
    );

    await screen.findByText("Repeat");

    expect(screen.queryByText("Guía de pronunciación (IPA)")).toBeNull();
    expect(screen.queryByText("Mostrar guía IPA")).toBeNull();
    expect(screen.queryByText("Ocultar guía IPA")).toBeNull();

    expect(screen.getByText(/^\/.*\/$/)).toBeTruthy();
  });
});
