import React, { createContext, useContext, useMemo, useState } from "react";

export type PronunciationGuideContextState = {
  isOpen: boolean;
  contextIpa: string | null;
  open: (opts?: { contextIpa?: string | null }) => void;
  close: () => void;
};

const Ctx = createContext<PronunciationGuideContextState | null>(null);

export function PronunciationGuideProvider(props: { children: React.ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const [contextIpa, setContextIpa] = useState<string | null>(null);

  const value = useMemo<PronunciationGuideContextState>(
    () => ({
      isOpen,
      contextIpa,
      open: (opts) => {
        setContextIpa(opts?.contextIpa ?? null);
        setIsOpen(true);
      },
      close: () => {
        setIsOpen(false);
        setContextIpa(null);
      }
    }),
    [isOpen, contextIpa]
  );

  return <Ctx.Provider value={value}>{props.children}</Ctx.Provider>;
}

export function usePronunciationGuide() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("PronunciationGuideProvider missing");
  return ctx;
}

