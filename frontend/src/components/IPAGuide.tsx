import React, { useMemo } from "react";
import { IPA_GUIDE_ROWS } from "../lessons/ipa";

export default function IPAGuide(props: { highlightedKeys?: string[] }) {
  const highlighted = useMemo(() => new Set(props.highlightedKeys ?? []), [props.highlightedKeys]);

  return (
    <div className="ipaGuide" aria-label="ipa-guide">
      <table className="ipaTable">
        <thead>
          <tr>
            <th scope="col">IPA</th>
            <th scope="col">Cómo suena (ES)</th>
            <th scope="col">Ejemplo (EN)</th>
          </tr>
        </thead>
        <tbody>
          {IPA_GUIDE_ROWS.map((r) => {
            const hot = highlighted.has(r.key);
            return (
              <tr key={r.key} className={hot ? "ipaRow ipaRowHot" : "ipaRow"}>
                <td className="ipaCellSym">
                  <code>{r.display}</code>
                </td>
                <td>{r.approxEs}</td>
                <td>
                  <code>{r.exampleEn}</code>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <div className="muted ipaNote">
        Nota: es una guía aproximada para hispanohablantes. El objetivo es ayudarte a notar sonidos clave, no “perfect
        IPA”.
      </div>
    </div>
  );
}

