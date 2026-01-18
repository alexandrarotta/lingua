# Lingua Coach (local-first)

MVP 100% local-first para practicar conversación por voz (por defecto inglés, multi-idioma):

- STT/TTS con Web Speech API (fallback a input texto).
- Corrección (gramática/ortografía), sugerencias de estilo y feedback de “pronunciación” aproximado por diff de palabras.
- Persistencia local en el navegador: SQLite (`sql.js` WASM) persistido en IndexedDB.
- Backend Fastify como “gateway” a proveedores de IA (LM Studio OpenAI-compatible + AnythingLLM Dev API), evitando CORS y protegiendo secretos.

## Idiomas

En `Settings`, puedes cambiar **Idioma (práctica)** (tag BCP‑47, ej. `it-IT`, `fr-FR`, `ru-RU`, `el-GR`):

- Ajusta STT (`SpeechRecognition.lang`) y TTS (`SpeechSynthesisUtterance.lang`) en **Chat / Lessons / Review**.
- Ajusta el prompt del coach: corrige y responde en el idioma objetivo; explica en español.

Nota: la disponibilidad de STT/TTS depende del navegador/OS. Si un idioma no está soportado verás errores tipo `language-not-supported` o no habrá voces disponibles.

### Packs de lecciones

- Inglés (default): `frontend/public/lessons/index.json` + `frontend/public/lessons/lessons/*.json`
- Otros idiomas: `frontend/public/lessons/<langBase>/index.json` + `frontend/public/lessons/<langBase>/lessons/*.json`
  - `it-IT` → `it`, `fr-FR` → `fr`, `ru-RU` → `ru`, `el-GR` → `el`

Incluye un pack completo A1–A2 para `it` (italiano) y packs mínimos de ejemplo para `fr`, `ru`, `el` (una lección A1 de saludos). Puedes ampliarlos agregando más JSONs.

## Requisitos

- Node.js `24.12.0` (o 24.x estable). Vite 7 requiere Node `>=20.19` o `>=22.12`.

## Setup

```bash
npm install
npm run dev
```

- El frontend (Vite) escucha en `0.0.0.0:5173` (puerto fijo) para poder exponerlo en LAN cuando corres en WSL2.
- El backend (Fastify) escucha en `0.0.0.0:8787` por defecto.
- Base de datos backend (auth + historial): `backend/db/lingua.sqlite` (se crea sola al arrancar).

Opcional (recomendado): fija un secreto para auth (si no, se regenera y las sesiones expiran al reiniciar):

```bash
export AUTH_JWT_SECRET='change-me'
```

- Tests: `npm run test`
- Lint: `npm run lint`

- Frontend: `http://localhost:5173`
- Backend: `http://localhost:8787`

## Acceder desde otro PC (LAN + WSL2)

WSL2 usa NAT: tu app corre dentro de WSL con una IP interna (`WSL_IP`) y Windows tiene tu IP en la red local (`LAN_IP`). Para que otro PC pueda abrir `http://<LAN_IP>:5173`, Windows debe escuchar en `LAN_IP:5173` y reenviar a `WSL_IP:5173` (portproxy) + permitir el puerto en el firewall.

### Pasos

1) En WSL, levanta la app (Vite debe quedar en `0.0.0.0:5173`):
```bash
npm run dev
```

2) En Windows (PowerShell como Admin), ejecuta:
```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\windows\setup-lan.ps1
```
El script detecta `LAN_IP` y `WSL_IP`, inicia `iphlpsvc` si hace falta, recrea el `portproxy` y abre el firewall para TCP `5173`.

3) Prueba en el host:
```powershell
Test-NetConnection <LAN_IP> -Port 5173
```

4) Desde otro PC en la misma LAN:
- `http://<LAN_IP>:5173`

Para deshacer los cambios:
```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\windows\teardown-lan.ps1
```

### Troubleshooting

- WSL: verifica que Vite esté escuchando:
  - `ss -lntp | rg ':5173'` (o `ss -lntp | grep 5173`)
- Windows: verifica el portproxy:
  - `netsh interface portproxy show v4tov4`
- Windows: prueba el puerto:
  - `Test-NetConnection <LAN_IP> -Port 5173`
- La IP de WSL cambia al reiniciar WSL/Windows: vuelve a ejecutar `scripts/windows/setup-lan.ps1`.
- Si tu red en Windows está en perfil **Público** o tu Wi‑Fi tiene “client/AP isolation”, puede que otro PC no pueda conectarse aunque el puerto esté abierto.
- Si tu distro no se llama `Ubuntu`, ejecuta: `.\scripts\windows\setup-lan.ps1 -DistroName <TuDistro>`.

### Nota (voz/mic en LAN)

En muchos navegadores, **SpeechRecognition** (micrófono/STT) requiere un **origen seguro**.
`http://localhost` cuenta como seguro, pero `http://192.168.x.x` normalmente **no**, y verás `not-allowed`.

Para usar voz desde otro PC por LAN:

1) Configura el portproxy (WSL2 → Windows → LAN) y confirma que el puerto responde:
   - `powershell -ExecutionPolicy Bypass -File .\scripts\windows\setup-lan.ps1`
   - `Test-NetConnection <LAN_IP> -Port 5173`

2) Habilita HTTPS en Vite con `mkcert` (Windows host):

- Instala `mkcert` (elige uno):
  - Chocolatey: `choco install mkcert`
  - WinGet: `winget install -e --id FiloSottile.mkcert`
- Instala el CA local (una vez): `mkcert -install`
- Genera un cert dev en el repo (PowerShell en la raíz del repo):
  ```powershell
  mkdir certs
  $LAN_IP = "192.168.1.84" # cambia esto
  $HOSTNAME = $env:COMPUTERNAME # opcional
  mkcert -key-file certs/lingua-dev-key.pem -cert-file certs/lingua-dev.pem localhost 127.0.0.1 ::1 $LAN_IP $HOSTNAME
  ```

`certs/` está en `.gitignore` (no se versionan claves privadas).
Vite habilita HTTPS automáticamente si encuentra esos archivos.

Si tu repo vive dentro de WSL (ej. `/home/...`), ejecuta estos comandos desde Windows sobre la ruta `\\wsl$\\<Distro>\\home\\...\\lingua`
(o copia los `.pem` a `certs/` en WSL).

3) Levanta la app y abre:
- Host (misma máquina): `https://localhost:5173`
- Otro PC: `https://<LAN_IP>:5173` (si el navegador lo pide, confía el cert)

Para que **otro PC** confíe el cert, debe confiar el CA de `mkcert` del host:
- En el host, encuentra el CA: `mkcert -CAROOT` (ahí está `rootCA.pem`).
- En Windows (otro PC), importa `rootCA.pem` al store “Trusted Root” (ej. `certutil -addstore -f Root rootCA.pem`).

Opcional: paths custom para Vite:
- `LINGUA_HTTPS_KEY=/ruta/a/key.pem`
- `LINGUA_HTTPS_CERT=/ruta/a/cert.pem`

## Endpoints

- `GET /api/health`
- `POST /api/coach/turn`
- `POST /api/ai/test`
- `GET /api/ai/models`
- `GET /api/ai/workspaces`
- `POST /api/lessons/coach` (opcional; mejora “Extra practice”)

### Auth (local)

Auth es **local** (sin servicios externos). El backend guarda usuarios en SQLite y usa cookies HttpOnly con JWT:

- `POST /api/auth/register` `{ email, password }`
- `POST /api/auth/login` `{ email, password }`
- `POST /api/auth/logout`
- `POST /api/auth/refresh`
- `GET  /api/auth/me`

Reset password (MVP sin email real):

- `POST /api/auth/forgot-password` `{ email }` → devuelve `resetUrl`/`resetToken` (dev) y lo loguea.
- `POST /api/auth/reset-password` `{ token, newPassword }` → cambia password y marca el token como usado.

Para enchufar email más adelante: reemplaza la devolución de `resetUrl` por el envío vía SMTP (ej. nodemailer) y deja el resto igual.

### Historial (por usuario)

- `GET  /api/sessions` (paginado por `before`)
- `POST /api/sessions` `{ title }`
- `GET  /api/sessions/:id`
- `DELETE /api/sessions/:id`
- `POST /api/sessions/:id/turns` `{ role, text, meta }`
- `GET  /api/sessions/:id/turns` (paginado por `before`)

## Lessons / Lecciones (A1–A2)

- Catálogo seed (local-first): `frontend/public/lessons/index.json`
- Contenido por lección: `frontend/public/lessons/lessons/*.json`
- Pantallas:
  - `Lessons`: lista + progreso + prerequisitos
  - `Lesson Runner`: micro‑pasos (listen → repeat → quiz → roleplay → wrapup)
  - `Review`: repaso de vocab/frases fallidas

### Progreso (cómo se completa)

- Repeat: aprobar al menos **2 frases** con **≥2 intentos** y **≥80%** de accuracy (diff de tokens).
- Quiz: **≥70%** correctas (MCQ/FIB/Reorder).

El progreso y stats se guardan en SQLite (sql.js) en tu navegador:
- `lessons_progress`, `lesson_step_progress`
- `vocab_stats` (términos con más errores), `phrase_stats` (frases con baja precisión)

### Extra practice (IA opcional)

En el wrap‑up, puedes generar 3–5 drills personalizados llamando a `POST /api/lessons/coach` usando el perfil de IA activo.

- LM Studio / AnythingLLM: se auto‑genera si la `baseUrl` es `http://...`.
- Para `https://...` (ej. OpenAI Cloud), por seguridad/costo se pide pulsar “Generar”.

Si la IA no devuelve JSON válido, se hace fallback seguro y la app no se cae.

### Editar/agregar lecciones

1. Elige el pack:
   - Inglés: `frontend/public/lessons/lessons/` + `frontend/public/lessons/index.json`
   - Otro idioma: `frontend/public/lessons/<langBase>/lessons/` + `frontend/public/lessons/<langBase>/index.json`
2. Crea/edita un JSON de lección en la carpeta `lessons/`.
3. Agrega/actualiza su entrada en el `index.json` del pack (orden + prerequisitos).
4. No hace falta tocar lógica del frontend.

### IPA offline (Repeat)

Actualmente el diccionario/convertidor offline está pensado para **inglés** y **italiano** (aprox).
En otros idiomas, se muestra IPA solo si viene en el seed (`ipa`), para evitar IPA incorrecto generado con reglas de otro idioma.

En los pasos **Repeat**, cada frase muestra una guía en **IPA** (en rojo).

Fuente del IPA (prioridad):
1. Si la frase trae `ipa` en el seed (`targetPhrases: [{ "text": "...", "ipa": "/.../" }]`), se usa tal cual.
2. Si no trae `ipa`, se genera **localmente y offline** con `toIpa(text)`:
   - lookup en un diccionario local (CMU / ARPABET),
   - conversión ARPABET → IPA (con stress `ˈ`/`ˌ`),
   - fallbacks simples para palabras fuera del diccionario.

Ejemplo (seed):
```json
{ "text": "Nice to meet you.", "ipa": "/naɪs tə miːt juː/" }
```

## Perfiles de IA (Settings)

Los perfiles se guardan localmente (SQLite en el navegador). La **API key no se persiste por defecto** (solo memoria de la sesión). Opción: “Recordar en este dispositivo” (localStorage) con advertencia.

Providers soportados por perfil:

### A) LM Studio (OpenAI-compatible)

1. Inicia LM Studio y habilita “OpenAI compatible server”.
2. Base URL típica: `http://localhost:1234/v1` (si pones `http://localhost:1234`, la app lo normaliza a `/v1`).
3. En Settings (perfil `Local (LM Studio)`):
   - Base URL: `http://localhost:1234/v1`
   - Model: usa “Listar modelos” o escribe el id
   - API key: normalmente vacío (opcional)

Endpoints usados:
- `GET  {baseUrl}/models`
- `POST {baseUrl}/chat/completions`

Nota: también puedes apuntar este provider a OpenAI Cloud (`https://api.openai.com/v1`) si quieres; requiere API key y un `model` válido.

### B) AnythingLLM (Developer API propia)

1. En Settings:
   - Perfil: `AnythingLLM`
   - Base URL típica: `http://localhost:3001` (sin `/v1`)
   - API key: **requerida** (Bearer)
   - Workspace Slug: requerido
   - Mode: `chat` (conversación) o `query` (RAG/consulta)
2. Usa “Listar workspaces” si tu versión lo soporta. Si falla, ingresa `workspaceSlug` manualmente.
3. Si tu instancia tiene Swagger, revisa `{baseUrl}/api/docs` (las rutas pueden variar por versión).

Endpoints usados:
- `POST {baseUrl}/api/v1/workspace/{workspaceSlug}/chat`
- (mejor esfuerzo) listar workspaces: intenta `GET {baseUrl}/api/workspaces`, si falla intenta `GET {baseUrl}/api/v1/workspaces`

## Troubleshooting

- `504` / “Servidor local no está levantado”: inicia LM Studio/AnythingLLM y revisa `baseUrl`.
- `502` / “API key inválida”: revisa tu key (AnythingLLM requiere key; LM Studio normalmente no).
- `502` / “Endpoint incorrecto”: revisa `baseUrl` (LM Studio debe terminar en `/v1`; AnythingLLM debe ser raíz sin `/api`).
- AnythingLLM: si “Listar workspaces” falla, ingresa `workspaceSlug` manualmente o revisa `{baseUrl}/api/docs`.
- Si el navegador no soporta Web Speech API, usa el input de texto.

## Decisiones y Suposiciones

- La API key no se persiste por defecto (solo memoria de la sesión).
- Auth/historial viven en el backend con SQLite local: `backend/db/lingua.sqlite` + migraciones en `backend/db/migrations/`.
- SQLite en backend usa `node:sqlite` (experimental en Node 24) para evitar dependencias nativas externas.
- Cookies:
  - `lingua_access` (15 min) + `lingua_refresh` (7 días), HttpOnly, SameSite=Lax.
  - `AUTH_JWT_SECRET` recomendado para no invalidar sesiones al reiniciar.
- Reset password:
  - no se envía email; el backend devuelve `resetUrl`/`resetToken` y lo registra en logs;
  - el token se guarda hasheado (SHA‑256), expira a los 30 min y es de un solo uso.
- `targetText` para diff de pronunciación:
  - si el usuario usa “Repetir frase”, el target es el último mensaje del asistente;
  - en un turno normal, el target por defecto es `correctedUserText`.
- AnythingLLM:
  - se le pide por defecto un JSON estricto (corrección + estilo + respuesta) para simplificar parsing;
  - si no devuelve JSON válido, se usa fallback MOCK para corrección/estilo y se conserva el texto del asistente.
