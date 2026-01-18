export type OpenAiEndpointPath = "/chat/completions" | "/models";

function normalizeEndpointPath(path: string): OpenAiEndpointPath {
  const p = path.trim();
  if (p === "/chat/completions") return "/chat/completions";
  if (p === "/models") return "/models";
  throw new Error(`Invalid endpointPath: "${path}".`);
}

function assertAbsoluteUrl(baseUrl: string): URL {
  try {
    return new URL(baseUrl);
  } catch {
    throw new Error(`Invalid baseUrl: "${baseUrl}". Expected an absolute URL (e.g. http://localhost:1234/v1).`);
  }
}

function stripTrailingSlashes(pathname: string) {
  return pathname.replace(/\/+$/, "") || "/";
}

function hasSegment(pathname: string, segment: string) {
  const re = new RegExp(`(?:^|/)${segment}(?:/|$)`, "i");
  return re.test(stripTrailingSlashes(pathname));
}

export function normalizeOpenAiCompatBaseUrl(baseUrl: string): string {
  const trimmed = baseUrl.trim();
  if (!trimmed) throw new Error("Missing baseUrl.");

  const url = assertAbsoluteUrl(trimmed);
  let pathname = stripTrailingSlashes(url.pathname);

  // If user provided only host:port, normalize to /v1.
  if (pathname === "/") pathname = "/v1";

  const hasResponses = hasSegment(pathname, "responses");
  const hasChat = /\/chat\/completions(?:\/|$)/i.test(pathname);
  const hasModels = hasSegment(pathname, "models");

  if (hasResponses || hasChat || hasModels) {
    throw new Error(
      `Invalid baseUrl for OpenAI-compatible Chat Completions. Use a baseUrl ending at the API root (e.g. http://localhost:1234/v1), not including "/responses", "/chat/completions", or "/models". Got: ${trimmed}`
    );
  }

  if (!pathname.toLowerCase().endsWith("/v1")) {
    throw new Error(
      `Invalid baseUrl for OpenAI-compatible provider. Expected baseUrl to end with "/v1" (e.g. http://localhost:1234/v1). Got: ${trimmed}`
    );
  }

  url.pathname = pathname;
  url.search = "";
  url.hash = "";
  return url.toString().replace(/\/$/, "");
}

export function buildOpenAiUrl(baseUrl: string, endpointPath: OpenAiEndpointPath): string {
  const url = assertAbsoluteUrl(baseUrl.trim());
  const basePath = stripTrailingSlashes(url.pathname);
  const endpoint = normalizeEndpointPath(endpointPath);
  url.pathname = basePath === "/" ? endpoint : `${basePath}${endpoint}`;
  return url.toString();
}

export function buildOpenAiChatCompletionsUrl(baseUrl: string) {
  const normalized = normalizeOpenAiCompatBaseUrl(baseUrl);
  return buildOpenAiUrl(normalized, "/chat/completions");
}

export function buildOpenAiModelsUrl(baseUrl: string) {
  const normalized = normalizeOpenAiCompatBaseUrl(baseUrl);
  return buildOpenAiUrl(normalized, "/models");
}
