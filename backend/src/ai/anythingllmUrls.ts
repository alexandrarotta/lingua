function assertAbsoluteUrl(baseUrl: string): URL {
  try {
    return new URL(baseUrl);
  } catch {
    throw new Error(`Invalid baseUrl: "${baseUrl}". Expected an absolute URL (e.g. http://localhost:3001).`);
  }
}

function stripTrailingSlashes(pathname: string) {
  return pathname.replace(/\/+$/, "") || "/";
}

export function normalizeAnythingLlmBaseUrl(baseUrl: string): string {
  const trimmed = baseUrl.trim();
  if (!trimmed) throw new Error("Missing baseUrl.");

  const url = assertAbsoluteUrl(trimmed);
  const pathname = stripTrailingSlashes(url.pathname);

  // MVP: expect root host only (no /api or /v1 in baseUrl).
  if (pathname !== "/") {
    throw new Error(
      `Invalid baseUrl for AnythingLLM. Use the server root (e.g. http://localhost:3001), not including "${pathname}".`
    );
  }

  url.pathname = "/";
  url.search = "";
  url.hash = "";

  // URL.toString() keeps a trailing "/" for root; remove it.
  return url.toString().replace(/\/$/, "");
}

export function buildAnythingLlmChatUrl(baseUrl: string, workspaceSlug: string): string {
  const base = normalizeAnythingLlmBaseUrl(baseUrl);
  const slug = workspaceSlug.trim();
  if (!slug) throw new Error("Missing workspaceSlug.");
  return `${base}/api/v1/workspace/${encodeURIComponent(slug)}/chat`;
}

export function buildAnythingLlmWorkspacesUrls(baseUrl: string): string[] {
  const base = normalizeAnythingLlmBaseUrl(baseUrl);
  return [`${base}/api/workspaces`, `${base}/api/v1/workspaces`];
}

