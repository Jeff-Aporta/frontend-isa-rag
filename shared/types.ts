/**
 * Tipos compartidos isa-rag (fuente de verdad).
 * CDN (tras push a main):
 *   https://cdn.jsdelivr.net/gh/Jeff-Aporta/frontend-isa-rag@main/shared/types.ts
 * Worker: vendor vía `npm run sync:shared` (wrangler no resuelve https:// en bundle).
 */

export const EMBEDDING_DIMS = 384 as const;
export const EMBEDDING_MODEL = "all-MiniLM-L6-v2" as const;
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
    .map(
      (s) =>
        `[Fragmento ${s.index} · ${s.source} · pág. ${s.page}]\n${s.content}`,
    )
    .join("\n\n");
}

export function buildHumanPrompt(context: string, question: string): string {
  return `Contexto recuperado:\n${context}\n\nPregunta: ${question}\n\nRespuesta:`;
}
