import React, { useEffect, useMemo, useState } from "react";
import { fetchModels, fetchWorkspaces, testAiConnection } from "../lib/api";
import { resolveLearningLangTag } from "../lib/learningLangPrefs";
import {
  getShowInlineIpaGuide,
  getPreferredAccent,
  getShowPronunciationGuideHints,
  setShowInlineIpaGuide,
  setPreferredAccent,
  setShowPronunciationGuideHints,
  type PreferredAccent
} from "../lib/pronunciationPrefs";
import { isAnythingLlmProfile, type AiProfile } from "../state/aiProfiles";
import { useAppState } from "../state/AppState";

function rememberFlagKey(profileId: string) {
  return `lingua.rememberApiKey.${profileId}`;
}

function apiKeyStorageKey(profileId: string) {
  return `lingua.apiKey.${profileId}`;
}

function loadRememberFlag(profileId: string) {
  return localStorage.getItem(rememberFlagKey(profileId)) === "1";
}

function loadRememberedApiKey(profileId: string) {
  return localStorage.getItem(apiKeyStorageKey(profileId)) ?? "";
}

function setRemembered(profileId: string, apiKey: string) {
  localStorage.setItem(rememberFlagKey(profileId), "1");
  localStorage.setItem(apiKeyStorageKey(profileId), apiKey);
}

function clearRemembered(profileId: string) {
  localStorage.removeItem(rememberFlagKey(profileId));
  localStorage.removeItem(apiKeyStorageKey(profileId));
}

export default function SettingsPanel() {
  const {
    profiles,
    activeProfileId,
    setActiveProfileId,
    saveProfile,
    sessionApiKeys,
    setSessionApiKey,
    learningLangSetting,
    setLearningLangSetting
  } = useAppState();

  const activeProfile = useMemo(() => {
    return profiles.find((p) => p.id === activeProfileId) ?? profiles[0]!;
  }, [profiles, activeProfileId]);

  const [draft, setDraft] = useState<AiProfile>(activeProfile);
  const [status, setStatus] = useState<string>("");
  const [models, setModels] = useState<string[]>([]);
  const [workspaces, setWorkspaces] = useState<string[]>([]);
  const [rememberOnDevice, setRememberOnDevice] = useState<boolean>(() => loadRememberFlag(activeProfile.id));
  const [preferredAccent, setPreferredAccentState] = useState<PreferredAccent>(() => getPreferredAccent());
  const [showPronunciationGuideHints, setShowPronunciationGuideHintsState] = useState<boolean>(() =>
    getShowPronunciationGuideHints()
  );
  const [showInlineIpaGuide, setShowInlineIpaGuideState] = useState<boolean>(() => getShowInlineIpaGuide());

  const apiKey = sessionApiKeys[activeProfile.id] ?? "";
  const providerIsAnythingLlm = isAnythingLlmProfile(draft);
  const anythingNeedsKey = providerIsAnythingLlm && !apiKey.trim();
  const anythingNeedsWorkspace = providerIsAnythingLlm && !draft.workspaceSlug.trim();

  const modelLooksLikeEmail = !providerIsAnythingLlm && draft.model.includes("@");
  const dirty =
    draft.baseUrl !== activeProfile.baseUrl ||
    draft.model !== activeProfile.model ||
    draft.name !== activeProfile.name ||
    draft.providerType !== activeProfile.providerType ||
    draft.workspaceSlug !== activeProfile.workspaceSlug ||
    draft.anythingllmMode !== activeProfile.anythingllmMode;

  useEffect(() => {
    setDraft(activeProfile);
    setStatus("");
    setModels([]);
    setWorkspaces([]);
    setRememberOnDevice(loadRememberFlag(activeProfile.id));

    if (!sessionApiKeys[activeProfile.id] && loadRememberFlag(activeProfile.id)) {
      const remembered = loadRememberedApiKey(activeProfile.id);
      if (remembered) setSessionApiKey(activeProfile.id, remembered);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeProfile.id]);

  useEffect(() => {
    if (!rememberOnDevice) return;
    setRemembered(activeProfile.id, apiKey);
  }, [rememberOnDevice, activeProfile.id, apiKey]);

  useEffect(() => {
    setPreferredAccent(preferredAccent);
  }, [preferredAccent]);

  useEffect(() => {
    setShowPronunciationGuideHints(showPronunciationGuideHints);
  }, [showPronunciationGuideHints]);

  useEffect(() => {
    setShowInlineIpaGuide(showInlineIpaGuide);
  }, [showInlineIpaGuide]);

  function onSelectProfile(nextId: string) {
    setActiveProfileId(nextId);
  }

  function normalizeProfile(p: AiProfile): AiProfile {
    const baseUrl = p.baseUrl.trim();
    if (!baseUrl) return { ...p, baseUrl: "" };

    try {
      const u = new URL(baseUrl);
      u.pathname = u.pathname.replace(/\/+$/, "") || "/";

      if (p.providerType === "LM_STUDIO_OPENAI_COMPAT") {
        if (u.pathname === "/") u.pathname = "/v1";
      }

      return {
        ...p,
        baseUrl: u.toString().replace(/\/$/, ""),
        model: p.model.trim(),
        workspaceSlug: p.workspaceSlug.trim()
      };
    } catch {
      return { ...p, baseUrl, model: p.model.trim(), workspaceSlug: p.workspaceSlug.trim() };
    }
  }

  function onSaveProfile() {
    const now = Date.now();
    const next: AiProfile = {
      ...normalizeProfile(draft),
      updatedAt: now
    };
    saveProfile(next);
    setStatus("Perfil guardado.");
  }

  async function onTest() {
    setStatus("Probando conexión...");
    try {
      const res = await testAiConnection({ profile: normalizeProfile(draft), apiKey: apiKey || undefined });
      if (res.ok) {
        const now = Date.now();
        const next: AiProfile = {
          ...normalizeProfile(draft),
          updatedAt: now
        };
        saveProfile(next);
        setStatus(`OK: ${res.message} · perfil guardado.`);
      } else {
        setStatus(`FALLÓ: ${res.message}`);
      }
    } catch (err) {
      setStatus(`FALLÓ: ${err instanceof Error ? err.message : "error"}`);
    }
  }

  async function onLoadModels() {
    setStatus("Cargando modelos...");
    try {
      const res = await fetchModels({ profile: normalizeProfile(draft), apiKey: apiKey || undefined });
      setModels(res.models);
      setStatus(res.models.length ? `Modelos: ${res.models.length}` : res.message || "Sin modelos (escribe manualmente).");
    } catch (err) {
      setModels([]);
      setStatus(`No se pudo listar modelos: ${err instanceof Error ? err.message : "error"}`);
    }
  }

  async function onLoadWorkspaces() {
    setStatus("Cargando workspaces...");
    try {
      const res = await fetchWorkspaces({ profile: normalizeProfile(draft), apiKey: apiKey || undefined });
      setWorkspaces(res.workspaces);
      setStatus(
        res.workspaces.length ? `Workspaces: ${res.workspaces.length}` : res.message || "No se pudieron listar workspaces."
      );
    } catch (err) {
      setWorkspaces([]);
      setStatus(`No se pudo listar workspaces: ${err instanceof Error ? err.message : "error"}`);
    }
  }

  const canTest = !!draft.baseUrl.trim() && !anythingNeedsKey && !anythingNeedsWorkspace;
  const learningLangOptions = useMemo(
    () => [
      { value: "auto", label: "Inglés (según acento)" },
      { value: "it-IT", label: "Italiano (it-IT)" },
      { value: "fr-FR", label: "Francés (fr-FR)" },
      { value: "ru-RU", label: "Ruso (ru-RU)" },
      { value: "el-GR", label: "Griego (el-GR)" }
    ],
    []
  );
  const knownLearningLangValues = useMemo(() => new Set(learningLangOptions.map((o) => o.value)), [learningLangOptions]);
  const learningLangSelectValue = knownLearningLangValues.has(learningLangSetting) ? learningLangSetting : "__custom__";
  const resolvedLearningLangTag = useMemo(() => resolveLearningLangTag(learningLangSetting), [learningLangSetting]);

  return (
    <div className="card">
      <h2 className="cardTitle">Settings · IA</h2>
      <p className="muted">La API key no se guarda por defecto. Se mantiene solo en memoria durante esta sesión.</p>

      <div className="row">
        <label style={{ minWidth: 300, flex: 1 }}>
          Perfil de IA
          <select value={activeProfile.id} onChange={(e) => onSelectProfile(e.target.value)}>
            {profiles.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>

        <label style={{ minWidth: 240, flex: 1 }}>
          Nombre del perfil
          <input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
        </label>

        <label style={{ minWidth: 260, flex: 1 }}>
          Proveedor
          <select
            value={draft.providerType}
            onChange={(e) => {
              const providerType = e.target.value as AiProfile["providerType"];
              setDraft({
                ...draft,
                providerType,
                // Clear provider-specific fields when switching.
                model: providerType === "LM_STUDIO_OPENAI_COMPAT" ? draft.model : "",
                workspaceSlug: providerType === "ANYTHINGLLM_DEV_API" ? draft.workspaceSlug : ""
              });
              setStatus("");
              setModels([]);
              setWorkspaces([]);
            }}
          >
            <option value="LM_STUDIO_OPENAI_COMPAT">LM Studio (OpenAI-compatible)</option>
            <option value="ANYTHINGLLM_DEV_API">AnythingLLM (Developer API)</option>
          </select>
        </label>

        <button className="btnPrimary" onClick={onSaveProfile} disabled={!dirty}>
          Guardar perfil
        </button>
      </div>

      <div className="row" style={{ marginTop: 12 }}>
        <label style={{ minWidth: 320, flex: 2 }}>
          Base URL
          <input
            value={draft.baseUrl}
            placeholder={providerIsAnythingLlm ? "http://localhost:3001" : "http://localhost:1234/v1"}
            onChange={(e) => setDraft({ ...draft, baseUrl: e.target.value })}
          />
        </label>

        {!providerIsAnythingLlm ? (
          <label style={{ minWidth: 260, flex: 1 }}>
            Model
            <input
              value={draft.model}
              list="models"
              placeholder="Usa “Listar modelos” o escribe un id"
              onChange={(e) => setDraft({ ...draft, model: e.target.value })}
            />
            <datalist id="models">
              {models.map((m) => (
                <option key={m} value={m} />
              ))}
            </datalist>
            {modelLooksLikeEmail ? (
              <div className="muted" style={{ marginTop: 6 }}>
                Warning: Model no es email; usa “Listar modelos”.
              </div>
            ) : null}
          </label>
        ) : (
          <>
            <label style={{ minWidth: 260, flex: 1 }}>
              Workspace Slug
              <input
                value={draft.workspaceSlug}
                list="workspaces"
                placeholder="Ej: my-workspace"
                onChange={(e) => setDraft({ ...draft, workspaceSlug: e.target.value })}
              />
              <datalist id="workspaces">
                {workspaces.map((w) => (
                  <option key={w} value={w} />
                ))}
              </datalist>
            </label>

            <label style={{ minWidth: 220, flex: 1 }}>
              Mode
              <select
                value={draft.anythingllmMode}
                onChange={(e) => setDraft({ ...draft, anythingllmMode: e.target.value as AiProfile["anythingllmMode"] })}
              >
                <option value="chat">chat</option>
                <option value="query">query</option>
              </select>
            </label>
          </>
        )}

        <label style={{ minWidth: 260, flex: 1 }}>
          API Key {providerIsAnythingLlm ? "(requerida)" : "(opcional)"}
          <input
            type="password"
            value={apiKey}
            placeholder={providerIsAnythingLlm ? "Bearer ..." : "(vacío si no aplica)"}
            onChange={(e) => setSessionApiKey(activeProfile.id, e.target.value)}
          />
        </label>
      </div>

      <div className="row" style={{ marginTop: 10 }}>
        <div className="pill" style={{ gap: 10 }}>
          <input
            type="checkbox"
            checked={rememberOnDevice}
            onChange={(e) => {
              const next = e.target.checked;
              setRememberOnDevice(next);
              if (next) setRemembered(activeProfile.id, apiKey);
              else clearRemembered(activeProfile.id);
            }}
          />
          <span>Recordar API key en este dispositivo</span>
        </div>
        {rememberOnDevice ? (
          <span className="muted">
            Advertencia: se guardará localmente (no recomendado en equipos compartidos).
          </span>
        ) : null}
      </div>

      <div className="row" style={{ marginTop: 10 }}>
        <label style={{ minWidth: 260, flex: 1 }}>
          Idioma (práctica)
          <select
            value={learningLangSelectValue}
            onChange={(e) => {
              const v = e.target.value;
              if (v === "__custom__") {
                const prev = learningLangSetting;
                const prevIsKnown = knownLearningLangValues.has(prev);
                setLearningLangSetting(prev !== "auto" && !prevIsKnown ? prev : "de-DE");
                return;
              }
              setLearningLangSetting(v);
            }}
          >
            {learningLangOptions.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
            <option value="__custom__">Otro… (BCP-47)</option>
          </select>
          {learningLangSelectValue === "__custom__" ? (
            <input
              value={learningLangSetting === "auto" ? "" : learningLangSetting}
              placeholder="Ej: de-DE, pt-BR, ja-JP"
              onChange={(e) => setLearningLangSetting(e.target.value.trim() ? e.target.value : "auto")}
              style={{ marginTop: 6 }}
            />
          ) : null}
          <div className="muted" style={{ marginTop: 6 }}>
            STT/TTS + Lessons + Review: <code>{resolvedLearningLangTag}</code>
          </div>
        </label>

        <label style={{ minWidth: 220 }}>
          Accent preferido
          <select value={preferredAccent} onChange={(e) => setPreferredAccentState(e.target.value as PreferredAccent)}>
            <option value="US">US (en-US)</option>
            <option value="UK">UK (en-GB)</option>
          </select>
        </label>

        <div className="pill" style={{ gap: 10 }}>
          <input
            type="checkbox"
            checked={showPronunciationGuideHints}
            onChange={(e) => setShowPronunciationGuideHintsState(e.target.checked)}
          />
          <span>Mostrar hints de pronunciación (IPA)</span>
        </div>

        <div className="pill" style={{ gap: 10 }}>
          <input
            type="checkbox"
            checked={showInlineIpaGuide}
            onChange={(e) => setShowInlineIpaGuideState(e.target.checked)}
          />
          <span>Mostrar guía IPA inline por defecto (Repeat)</span>
        </div>

        <span className="muted">Preferencias locales (este navegador).</span>
      </div>

      {anythingNeedsKey ? (
        <p className="muted" style={{ marginTop: 10 }}>
          AnythingLLM requiere API key (Developer API).
        </p>
      ) : null}

      {anythingNeedsWorkspace ? (
        <p className="muted" style={{ marginTop: 10 }}>
          AnythingLLM requiere <code>workspaceSlug</code>. Usa “Listar workspaces” o ingrésalo manualmente.
        </p>
      ) : null}

      <div className="row" style={{ marginTop: 12 }}>
        <button className="btnPrimary" onClick={onTest} disabled={!canTest}>
          Probar conexión
        </button>
        {!providerIsAnythingLlm ? (
          <button onClick={onLoadModels} disabled={!draft.baseUrl.trim()}>
            Listar modelos
          </button>
        ) : (
          <button onClick={onLoadWorkspaces} disabled={!draft.baseUrl.trim() || !apiKey.trim()}>
            Listar workspaces
          </button>
        )}
        <button
          onClick={() => {
            setSessionApiKey(activeProfile.id, "");
            clearRemembered(activeProfile.id);
            setRememberOnDevice(false);
          }}
          disabled={!apiKey}
        >
          Limpiar API key
        </button>
        <span className="muted" aria-label="settings-status">
          {status}
        </span>
      </div>

      <p className="muted" style={{ marginTop: 12 }}>
        {providerIsAnythingLlm ? (
          <>
            AnythingLLM Dev API: <code>/api/v1/workspace/&lt;slug&gt;/chat</code> (stream-chat opcional).
          </>
        ) : (
          <>
            OpenAI-compatible: <code>/chat/completions</code> y <code>/models</code> (no se usa <code>/responses</code>).
          </>
        )}
      </p>
      <p className="muted">
        {providerIsAnythingLlm ? (
          <>
            Tip AnythingLLM: baseUrl típico <code>http://localhost:3001</code> · requiere API key + workspaceSlug.
          </>
        ) : (
          <>
            Tip LM Studio: baseUrl típico <code>http://localhost:1234/v1</code> · API key vacío.
          </>
        )}
      </p>
    </div>
  );
}
