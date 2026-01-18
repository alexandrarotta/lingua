import React, { createContext, useContext, useMemo, useState } from "react";
import type { LinguaDb } from "../db/db";
import { getLearningLangSetting, setLearningLangSetting, type LearningLangSetting } from "../lib/learningLangPrefs";
import type { AiProfile } from "./aiProfiles";

type AppState = {
  db: LinguaDb;
  profiles: AiProfile[];
  activeProfileId: string;
  setActiveProfileId: (id: string) => void;
  saveProfile: (profile: AiProfile) => void;
  sessionApiKeys: Record<string, string>;
  setSessionApiKey: (profileId: string, apiKey: string) => void;
  learningLangSetting: LearningLangSetting;
  setLearningLangSetting: (setting: LearningLangSetting) => void;
};

const Ctx = createContext<AppState | null>(null);

export function AppStateProvider(props: {
  db: LinguaDb;
  initialProfiles: AiProfile[];
  initialActiveProfileId: string;
  children: React.ReactNode;
}) {
  const [profiles, setProfiles] = useState<AiProfile[]>(props.initialProfiles);
  const [activeProfileId, setActiveProfileIdState] = useState<string>(props.initialActiveProfileId);
  const [sessionApiKeys, setSessionApiKeys] = useState<Record<string, string>>({});
  const [learningLangSettingState, setLearningLangSettingState] = useState<LearningLangSetting>(() =>
    getLearningLangSetting()
  );

  const value = useMemo<AppState>(
    () => ({
      db: props.db,
      profiles,
      activeProfileId,
      setActiveProfileId: (id) => {
        setActiveProfileIdState(id);
        props.db.setActiveAiProfileId(id);
      },
      saveProfile: (profile) => {
        props.db.upsertAiProfile(profile);
        setProfiles((prev) => prev.map((p) => (p.id === profile.id ? profile : p)));
      },
      sessionApiKeys,
      setSessionApiKey: (profileId, apiKey) => {
        setSessionApiKeys((prev) => ({ ...prev, [profileId]: apiKey }));
      },
      learningLangSetting: learningLangSettingState,
      setLearningLangSetting: (setting) => {
        setLearningLangSetting(setting);
        setLearningLangSettingState(setting);
      }
    }),
    [props.db, profiles, activeProfileId, sessionApiKeys, learningLangSettingState]
  );

  return <Ctx.Provider value={value}>{props.children}</Ctx.Provider>;
}

export function useAppState() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("AppStateProvider missing");
  return ctx;
}
