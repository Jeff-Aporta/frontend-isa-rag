/**
 * Tipos compartidos isa-rag (fuente de verdad).
 * CDN (tras push a main):
 *   https://cdn.jsdelivr.net/gh/Jeff-Aporta/frontend-isa-rag@main/shared/types.ts
 * Worker: vendor vía `npm run sync:shared` (wrangler no resuelve https:// en bundle).
 */

export const EMBEDDING_DIMS = 384 as const;
export const EMBEDDING_MODEL = "@cf/baai/bge-small-en-v1.5" as const;
export const DEFAULT_TOP_K = 4 as const;
export const CHUNK_SIZE = 1000 as const;
export const CHUNK_OVERLAP = 100 as const;

export type LlmProviderId = "minimax" | "openai" | "cf-ai";

export type ThemeMode = "dark" | "light";

export interface Space {
  id: string;
  name: string;
  description: string | null;
  createdAt: string;
  docCount?: number;
}

export interface RagDocument {
  id: string;
  spaceId: string;
  filename: string;
  mime: string;
  bytes: number;
  pages: number | null;
  status: "pending" | "indexed" | "error";
  errorMessage: string | null;
  createdAt: string;
}

/** Chunk indexado (vista de inspección, sin embedding). */
export interface RagChunk {
  id: string;
  documentId: string;
  spaceId: string;
  content: string;
  page: number | null;
  chunkIndex: number;
  source: string;
}

export interface SourceFragment {
  index: number;
  source: string;
  page: string | number;
  content: string;
  score?: number;
  meta?: {
    youtubeVideoId?: string;
    youtubeStartMs?: number;
    youtubeEndMs?: number;
    youtubeUrl?: string;
    lang?: string;
    title?: string;
  };
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  sources?: SourceFragment[];
  createdAt: string;
}

export interface AskRequest {
  question: string;
  spaceId: string;
  k?: number;
  provider?: LlmProviderId;
}

// —— Estadísticas de uso por espacio ——

export type StatEvent =
  | "ask"
  | "upload"
  | "index"
  | "chunk_view"
  | "create"
  | "update"
  | "delete"
  | "embed";

export interface SpaceStatsTopUser {
  username: string;
  count: number;
}

export interface SpaceStatsLastEvent {
  event: StatEvent;
  username: string;
  ts: string;
}

export interface SpaceStats {
  spaceId: string;
  total: number;
  perEvent: Record<StatEvent, number>;
  topUsers: SpaceStatsTopUser[];
  lastEvent: SpaceStatsLastEvent | null;
  windowDays: number | null;
}

export interface SpaceStatsUserRow {
  username: string;
  event: StatEvent;
  count: number;
  lastAt: string;
}

export interface SpaceStatsUsersResponse {
  spaceId: string;
  rows: SpaceStatsUserRow[];
  events: StatEvent[];
  windowDays: number | null;
}

// —— Recursos (Cuestionario, Podcast, …) ——

export type ResourceId =
  | "quiz"
  | "podcast"
  | "summary"
  | "mindmap"
  | "briefing"
  | "flashcards";

export interface ResourceMeta {
  id: ResourceId;
  title: string;
  description: string;
  icon: string;
}

export const RESOURCE_CATALOG: ResourceMeta[] = [
  { id: "quiz", title: "Cuestionario", description: "Preguntas tipo test sobre los documentos del espacio", icon: "mdi:help-circle-outline" },
  { id: "podcast", title: "Podcast", description: "Conversación generada entre dos presentadores", icon: "mdi:microphone-outline" },
  { id: "summary", title: "Resumen", description: "Síntesis ejecutiva del espacio", icon: "mdi:text-short" },
  { id: "mindmap", title: "Mapa mental", description: "Ideas clave conectadas en un grafo", icon: "mdi:graph-outline" },
  { id: "briefing", title: "Informe", description: "Documento estructurado en Markdown", icon: "mdi:file-document-outline" },
  { id: "flashcards", title: "Tarjetas", description: "Tarjetas pregunta/respuesta para repaso", icon: "mdi:card-outline" },
];

export interface ResourceQuestion {
  id: string;
  spaceId: string;
  resourceId: ResourceId;
  text: string;
  source: "generated" | "manual";
  createdAt: string;
}

export interface ResourceMatch {
  resourceId: ResourceId;
  title: string;
  icon: string;
  description: string;
  score: number;   // 0..1 (1 = idéntico)
  bestQuestions: string[];
}

export interface ResourceMatchResponse {
  spaceId: string;
  question: string;
  matches: ResourceMatch[];
}

export interface AskResponse {
  answer: string;
  sources: SourceFragment[];
  provider: LlmProviderId;
  model: string;
}

export interface CreateSpaceRequest {
  name: string;
  description?: string;
}

export interface UpdateSpaceRequest {
  name?: string;
  description?: string | null;
}

export interface IndexJobResult {
  spaceId: string;
  documents: number;
  chunks: number;
  embeddingModel: typeof EMBEDDING_MODEL;
}

export interface HealthResponse {
  ok: boolean;
  service: "worker-isa-rag";
  embeddingModel: typeof EMBEDDING_MODEL;
  embeddingDims: typeof EMBEDDING_DIMS;
  llmProvider: LlmProviderId;
  schema: "BD_ISA_RAG";
}

export type SupportedMime =
  | "application/pdf"
  | "text/plain"
  | "text/markdown"
  | "text/csv"
  | "text/html"
  | "application/json"
  | "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

export const SUPPORTED_EXTENSIONS = [
  ".pdf",
  ".txt",
  ".md",
  ".markdown",
  ".csv",
  ".html",
  ".htm",
  ".json",
  ".docx",
] as const;

export const SYSTEM_PROMPT =
  "Eres un asistente especializado en responder basándote EXCLUSIVAMENTE en los fragmentos proporcionados. " +
  "Si el contexto no contiene la información necesaria, responde: " +
  "'No tengo información sobre eso en los documentos cargados.' " +
  "Cita siempre las fuentes en formato [Fragmento N].";

export function formatContext(sources: SourceFragment[]): string {
  return sources
    .map((s) => {
      const yt = s.meta?.youtubeVideoId;
      if (yt) {
        const ts = formatTimestamp(s.meta?.youtubeStartMs ?? 0);
        const url = s.meta?.youtubeUrl ?? `https://youtu.be/${yt}?t=${Math.floor((s.meta?.youtubeStartMs ?? 0) / 1000)}`;
        return `[Fragmento ${s.index} · ${s.source} · ${s.meta?.title ?? yt} · ${ts} (${url})]\n${s.content}`;
      }
      return `[Fragmento ${s.index} · ${s.source} · pág. ${s.page}]\n${s.content}`;
    })
    .join("\n\n");
}

export function formatTimestamp(ms: number): string {
  const total = Math.floor(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return h > 0
    ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
    : `${m}:${String(s).padStart(2, "0")}`;
}

export function buildHumanPrompt(context: string, question: string): string {
  return `Contexto recuperado:\n${context}\n\nPregunta: ${question}\n\nRespuesta:`;
}
