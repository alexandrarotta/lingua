import React, { useMemo } from "react";
import { isSpeechRecognitionAvailable, isVoiceSecureContext } from "../lib/speech";

export default function VoiceSecurityBanner() {
  const info = useMemo(() => {
    const supported = isSpeechRecognitionAvailable();
    const secure = isVoiceSecureContext();
    const hostname = window.location.hostname;
    const port = window.location.port;
    const httpsUrl = `https://${hostname}${port ? `:${port}` : ""}`;
    const localhostUrl = `http://localhost${port ? `:${port}` : ""}`;
    return { supported, secure, httpsUrl, localhostUrl };
  }, []);

  if (!info.supported || info.secure) return null;

  return (
    <div
      className="bubble"
      role="status"
      style={{
        marginTop: 16,
        borderColor: "rgba(241, 196, 15, 0.75)",
        background: "rgba(241, 196, 15, 0.06)"
      }}
    >
      <strong>Voz requiere HTTPS o localhost.</strong>
      <div className="muted" style={{ marginTop: 6 }}>
        En HTTP por IP/LAN, el micrófono/STT suele quedar bloqueado. Abre{" "}
        <a href={info.httpsUrl}>{info.httpsUrl}</a> (y confía el cert) o usa{" "}
        <a href={info.localhostUrl}>{info.localhostUrl}</a>.
      </div>
    </div>
  );
}

