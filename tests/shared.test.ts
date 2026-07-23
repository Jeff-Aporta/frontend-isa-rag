import assert from "node:assert/strict";
import { test } from "node:test";
import {
  CHUNK_OVERLAP,
  CHUNK_SIZE,
  DEFAULT_TOP_K,
  EMBEDDING_DIMS,
  EMBEDDING_MODEL,
  SYSTEM_PROMPT,
  buildHumanPrompt,
  formatContext,
} from "../shared/types.ts";
import { isSupportedFilename } from "../shared/index.ts";

test("constantes FitDocs / MiniLM", () => {
  assert.equal(EMBEDDING_DIMS, 384);
  assert.equal(EMBEDDING_MODEL, "all-MiniLM-L6-v2");
  assert.equal(CHUNK_SIZE, 1000);
  assert.equal(CHUNK_OVERLAP, 100);
  assert.equal(DEFAULT_TOP_K, 4);
  assert.match(SYSTEM_PROMPT, /Fragmento N/);
});

test("formatContext cita fragmentos", () => {
  const s = formatContext([
    { index: 1, source: "a.pdf", page: 2, content: "hola" },
  ]);
  assert.match(s, /\[Fragmento 1 · a\.pdf · pág\. 2\]/);
  assert.match(s, /hola/);
});

test("buildHumanPrompt", () => {
  const p = buildHumanPrompt("CTX", "¿cuánto?");
  assert.match(p, /Contexto recuperado/);
  assert.match(p, /Pregunta: ¿cuánto\?/);
});

test("extensiones soportadas", () => {
  assert.equal(isSupportedFilename("x.pdf"), true);
  assert.equal(isSupportedFilename("x.docx"), true);
  assert.equal(isSupportedFilename("x.exe"), false);
});
