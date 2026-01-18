import type { PronunciationToken } from "../lib/diffTokens";

export default function PronunciationTokens(props: { tokens: PronunciationToken[] }) {
  if (!props.tokens.length) return null;

  return (
    <div className="tokens" aria-label="pronunciation-tokens">
      {props.tokens.map((t, idx) => {
        const cls =
          t.status === "ok"
            ? "token tokenOk"
            : t.status === "missing"
              ? "token tokenMissing"
              : t.status === "extra"
                ? "token tokenExtra"
                : "token tokenSub";

        const text =
          t.status === "ok"
            ? t.expected
            : t.status === "missing"
              ? t.expected
              : t.status === "extra"
                ? `+${t.actual}`
                : `${t.expected}(${t.actual})`;

        return (
          <span key={idx} className={cls} title={t.status}>
            {text}
          </span>
        );
      })}
    </div>
  );
}

