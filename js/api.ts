/** API client tipado — isa-rag */
import type {
  AskRequest,
  AskResponse,
  CreateSpaceRequest,
  HealthResponse,
  IndexJobResult,
  RagChunk,
  RagDocument,
  Space,
} from "../shared/types.ts";

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

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${apiBase()}${path}`, {
    ...init,
    headers: {
      ...(init?.body instanceof FormData ? {} : { "Content-Type": "application/json" }),
      ...(init?.headers || {}),
    },
  });
  if (!res.ok) {
    let msg = `${res.status} ${res.statusText}`;
    try {
      const j = (await res.json()) as { error?: string };
      if (j.error) msg = j.error;
    } catch {
      /* ignore */
    }
    throw new Error(msg);
  }
  return (await res.json()) as T;
}

export const api = {
  health: () => req<HealthResponse>("/api/health"),
  listSpaces: () => req<{ spaces: Space[] }>("/api/spaces"),
  createSpace: (body: CreateSpaceRequest) =>
    req<{ space: Space }>("/api/spaces", { method: "POST", body: JSON.stringify(body) }),
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
