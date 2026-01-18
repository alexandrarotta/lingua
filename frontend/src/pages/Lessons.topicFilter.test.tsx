import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import LessonsPage from "./Lessons";

vi.mock("../state/AppState", () => {
  return {
    useAppState: () => ({
      db: {
        listLessonsProgress: () => [],
        ensureLessonStarted: () => undefined
      }
    })
  };
});

vi.mock("../lessons/catalog", () => {
  return {
    loadLessonIndex: vi.fn(async () => ({
      version: 1,
      title: "Test",
      lessons: [
        {
          id: "l1",
          level: "A1",
          topic: "Travel",
          titleEn: "Hi",
          titleEs: "Hola",
          estimatedMinutes: 5,
          prerequisites: []
        },
        {
          id: "l2",
          level: "A2",
          topic: "Work",
          titleEn: "Work",
          titleEs: "Trabajo",
          estimatedMinutes: 5,
          prerequisites: []
        }
      ]
    }))
  };
});

describe("LessonsPage Topic filter", () => {
  it("resets Topic to ALL when Level change makes it invalid", async () => {
    render(
      <MemoryRouter>
        <LessonsPage />
      </MemoryRouter>
    );

    await screen.findByText("A1");

    const levelSelect = screen.getByLabelText("Level") as HTMLSelectElement;
    const topicSelect = screen.getByLabelText("Topic") as HTMLSelectElement;

    fireEvent.change(levelSelect, { target: { value: "A1" } });
    expect(screen.queryByRole("option", { name: "Work" })).toBeNull();

    fireEvent.change(topicSelect, { target: { value: "Travel" } });
    expect(topicSelect.value).toBe("Travel");

    fireEvent.change(levelSelect, { target: { value: "A2" } });

    await waitFor(() => {
      expect((screen.getByLabelText("Topic") as HTMLSelectElement).value).toBe("ALL");
    });
  });
});

