const DEFAULT_API_BASE = "http://localhost:8000";

/** Backend API origin for browser fetch calls (local dev default). */
export function getApiBaseUrl(): string {
  const configured = process.env.NEXT_PUBLIC_API_BASE_URL?.trim();
  if (configured) {
    return configured.replace(/\/+$/, "");
  }
  return DEFAULT_API_BASE;
}

/** Join API base with a path segment (path must start with `/`). */
export function apiUrl(path: string): string {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${getApiBaseUrl()}${normalizedPath}`;
}
