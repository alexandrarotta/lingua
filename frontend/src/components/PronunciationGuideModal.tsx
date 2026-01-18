import React, { useEffect, useMemo, useState } from "react";
import { extractIpaSymbols } from "../lessons/ipa";
import IPAGuide from "./IPAGuide";
import { usePronunciationGuide } from "../state/PronunciationGuide";
import {
  getPreferredAccent,
  getPronunciationGuideLastTab,
  getShowPronunciationGuideHints,
  setPronunciationGuideLastTab,
  type PronunciationGuideTabId
} from "../lib/pronunciationPrefs";

function TabButton(props: {
  id: PronunciationGuideTabId;
  activeId: PronunciationGuideTabId;
  label: string;
  onSelect: (id: PronunciationGuideTabId) => void;
}) {
  const active = props.id === props.activeId;
  return (
    <button
      className={active ? "btnPrimary" : ""}
      role="tab"
      aria-selected={active}
      onClick={() => props.onSelect(props.id)}
    >
      {props.label}
    </button>
  );
}

export default function PronunciationGuideModal() {
  const guide = usePronunciationGuide();

  const [tab, setTab] = useState<PronunciationGuideTabId>(() => getPronunciationGuideLastTab());
  const [showHints, setShowHints] = useState<boolean>(() => getShowPronunciationGuideHints());
  const [accent, setAccent] = useState(() => getPreferredAccent());

  useEffect(() => {
    if (!guide.isOpen) return;
    // Refresh prefs every time the modal opens (Settings may have changed).
    setShowHints(getShowPronunciationGuideHints());
    setAccent(getPreferredAccent());

    // If there is an IPA context, default to chart so highlights are visible.
    if (guide.contextIpa?.trim()) setTab("chart");
    else setTab(getPronunciationGuideLastTab());
  }, [guide.isOpen, guide.contextIpa]);

  useEffect(() => {
    setPronunciationGuideLastTab(tab);
  }, [tab]);

  useEffect(() => {
    if (!guide.isOpen) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") guide.close();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [guide, guide.isOpen]);

  const highlighted = useMemo(() => {
    const ipa = guide.contextIpa?.trim();
    if (!ipa) return [];
    return Array.from(extractIpaSymbols(ipa));
  }, [guide.contextIpa]);

  if (!guide.isOpen) return null;

  return (
    <div
      className="modalOverlay"
      role="dialog"
      aria-modal="true"
      aria-label="Pronunciation guide"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) guide.close();
      }}
    >
      <div className="modalPanel">
        <div className="row" style={{ justifyContent: "space-between" }}>
          <div>
            <h2 className="cardTitle" style={{ margin: 0 }}>
              Guía de pronunciación (IPA)
            </h2>
            <div className="muted" style={{ marginTop: 6 }}>
              Recurso general · {accent === "UK" ? "UK" : "US"} accent
            </div>
          </div>
          <button onClick={guide.close}>Close</button>
        </div>

        {guide.contextIpa?.trim() ? (
          <div className="bubble" style={{ marginTop: 12 }}>
            <strong>IPA de la frase actual</strong>
            <div className="ipaPhraseLine" style={{ marginTop: 6 }}>
              <code>{guide.contextIpa}</code>
            </div>
            <div className="muted" style={{ marginTop: 8 }}>
              Los símbolos presentes se resaltan en la tabla (solo ayuda visual).
            </div>
          </div>
        ) : null}

        <div className="row" style={{ marginTop: 12 }}>
          <div role="tablist" aria-label="Pronunciation guide tabs" className="row">
            <TabButton id="chart" activeId={tab} label="IPA Quick Chart" onSelect={setTab} />
            <TabButton id="practice" activeId={tab} label="Cómo practicar" onSelect={setTab} />
            <TabButton id="issues" activeId={tab} label="Problemas comunes" onSelect={setTab} />
          </div>
        </div>

        <div style={{ marginTop: 12 }}>
          {tab === "chart" ? (
            <div role="tabpanel" aria-label="IPA Quick Chart">
              <IPAGuide highlightedKeys={highlighted} />
            </div>
          ) : null}

          {tab === "practice" ? (
            <div role="tabpanel" aria-label="How to practice">
              {!showHints ? (
                <p className="muted">Hints desactivados. Actívalos en Settings para ver esta sección.</p>
              ) : (
                <div className="bubble">
                  <ul className="muted" style={{ margin: "8px 0 0 16px" }}>
                    <li>
                      <strong>Shadowing</strong>: escucha una frase corta y repítela enseguida (sin traducir).
                    </li>
                    <li>
                      <strong>Stress y ritmo</strong>: marca la sílaba fuerte (ˈ) y mantén un ritmo constante.
                    </li>
                    <li>
                      <strong>Minimal pairs</strong>: practica pares como <code>ship/sheep</code>, <code>bit/beat</code>.
                    </li>
                    <li>
                      <strong>Pequeñas repeticiones</strong>: 2–3 repeticiones buenas valen más que 20 rápidas.
                    </li>
                    <li>
                      <strong>Usa el diff</strong>: repite y mira qué palabras faltan/extra (ok/missing/extra/substituted).
                    </li>
                  </ul>
                </div>
              )}
            </div>
          ) : null}

          {tab === "issues" ? (
            <div role="tabpanel" aria-label="Common issues">
              {!showHints ? (
                <p className="muted">Hints desactivados. Actívalos en Settings para ver esta sección.</p>
              ) : (
                <div style={{ display: "grid", gap: 10 }}>
                  <div className="bubble">
                    <strong>/θ/ y /ð/ (“th”)</strong>
                    <div className="muted" style={{ marginTop: 6 }}>
                      Lengua suavemente entre dientes. /θ/ sin voz (<code>think</code>), /ð/ con voz (<code>this</code>).
                    </div>
                  </div>
                  <div className="bubble">
                    <strong>/v/ vs /b/</strong>
                    <div className="muted" style={{ marginTop: 6 }}>
                      /v/ usa dientes en el labio inferior (fricción). Evita convertirlo en “b”.
                    </div>
                  </div>
                  <div className="bubble">
                    <strong>/ɪ/ vs /iː/</strong>
                    <div className="muted" style={{ marginTop: 6 }}>
                      /ɪ/ es más corta (<code>sit</code>), /iː/ más larga (<code>see</code>). Alarga la /iː/.
                    </div>
                  </div>
                  <div className="bubble">
                    <strong>/h/</strong>
                    <div className="muted" style={{ marginTop: 6 }}>
                      Es aspirada (<code>hello</code>). No la conviertas en “j” fuerte.
                    </div>
                  </div>
                  <div className="bubble">
                    <strong>/r/ (inglés)</strong>
                    <div className="muted" style={{ marginTop: 6 }}>
                      Suave, sin vibrar. Piensa en “r” aproximante, especialmente al inicio (<code>red</code>).
                    </div>
                  </div>
                </div>
              )}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

