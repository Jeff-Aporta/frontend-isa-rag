/** API client tipado — isa-rag (+ JWT Bearer) */
import type {
  AskRequest,
  AskResponse,
  CreateSpaceRequest,
  HealthResponse,
  IndexJobResult,
  RagChunk,
  RagDocument,
  Space,
  UpdateSpaceRequest,
} from "../shared/types.ts";

const TOKEN_KEY = "isa-rag:token";
const USER_KEY = "isa-rag:user";

const DEFAULT_API =
  typeof location !== "undefined" && location.hostname === "localhost"
    ? "http://localhost:8810"
    : "https://worker-isa-rag.jeffaporta.workers.dev";

export function apiBase(): string {
  try {
    const q = new URLSearchParams(location.search).get("api");
    if (q) return q.replace(/\/$/, "");
    const ls = localStorage.getItem("isa-rag:api");
    if (ls) return ls.replace(/\/$/, "");
  } catch {
    /* ignore */
  }
  return DEFAULT_API;
}

export function getToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function getStoredUser(): string | null {
  try {
    return localStorage.getItem(USER_KEY);
  } catch {
    return null;
  }
}

export function setSession(token: string, username: string): void {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USER_KEY, username);
}

export function clearSession(): void {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function req<T>(path: string, init?: RequestInit, auth = true): Promise<T> {
  const headers: Record<string, string> = {
    ...(init?.body instanceof FormData ? {} : { "Content-Type": "application/json" }),
    ...(init?.headers as Record<string, string> | undefined),
  };
  if (auth) {
    const t = getToken();
    if (t) headers.Authorization = `Bearer ${t}`;
  }
  const res = await fetch(`${apiBase()}${path}`, { ...init, headers });
  if (!res.ok) {
    let msg = `${res.status} ${res.statusText}`;
    try {
      const j = (await res.json()) as { error?: string };
      if (j.error) msg = j.error;
    } catch {
      /* ignore */
    }
    if (res.status === 401 && auth) clearSession();
    throw new ApiError(res.status, msg);
  }
  return (await res.json()) as T;
}

export interface LoginResponse {
  token: string;
  expiresAt: string;
  username: string;
  ttlSec: number;
}

export const api = {
  health: () => req<HealthResponse>("/api/health", undefined, false),
  login: (username: string, password: string) =>
    req<LoginResponse>(
      "/api/auth/login",
      { method: "POST", body: JSON.stringify({ username, password }) },
      false,
    ),
  me: () => req<{ username: string; role?: string }>("/api/auth/me"),
  listSpaces: () => req<{ spaces: Space[] }>("/api/spaces"),
  createSpace: (body: CreateSpaceRequest) =>
    req<{ space: Space }>("/api/spaces", { method: "POST", body: JSON.stringify(body) }),
  updateSpace: (spaceId: string, body: UpdateSpaceRequest) =>
    req<{ space: Space }>(`/api/spaces/${encodeURIComponent(spaceId)}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),
  deleteSpace: (spaceId: string) =>
    req<{ ok: boolean; id: string }>(`/api/spaces/${encodeURIComponent(spaceId)}`, {
      method: "DELETE",
    }),
  listDocuments: (spaceId: string) =>
    req<{ documents: RagDocument[] }>(`/api/spaces/${encodeURIComponent(spaceId)}/documents`),
  listChunks: (spaceId: string, docId: string) =>
    req<{ document: { id: string; filename: string; spaceId: string }; chunks: RagChunk[] }>(
      `/api/spaces/${encodeURIComponent(spaceId)}/documents/${encodeURIComponent(docId)}/chunks`,
    ),
  upload: async (spaceId: string, files: FileList | File[]) => {
    const fd = new FormData();
    for (const f of Array.from(files)) fd.append("files", f);
    return req<{ documents: RagDocument[] }>(
      `/api/spaces/${encodeURIComponent(spaceId)}/documents`,
      { method: "POST", body: fd },
    );
  },
  index: (spaceId: string) =>
    req<IndexJobResult>(`/api/spaces/${encodeURIComponent(spaceId)}/index`, {
      method: "POST",
      body: "{}",
    }),
  ask: (body: AskRequest) =>
    req<AskResponse>("/api/ask", { method: "POST", body: JSON.stringify(body) }),
};
