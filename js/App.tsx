import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "./api.ts";
import { useTheme } from "./theme.ts";
import type { ChatMessage, RagDocument, SourceFragment, Space } from "../shared/types.ts";
import { isSupportedFilename, newId } from "../shared/index.ts";

function SourcesBlock({ sources }: { sources: SourceFragment[] }) {
  if (!sources.length) return null;
  return (
    <details className="sources" open>
      <summary>
        <iconify-icon icon="mdi:book-open-page-variant" width="14" height="14" /> Fuentes (
        {sources.length})
      </summary>
      {sources.map((s) => (
        <div className="fragment" key={`${s.index}-${s.source}`}>
          <strong>
            Fragmento {s.index} — {s.source} — pág. {s.page}
          </strong>
          <p>{s.content}</p>
        </div>
      ))}
    </details>
  );
}

export function App() {
  const [theme, toggleTheme] = useTheme();
  const [spaces, setSpaces] = useState<Space[]>([]);
  const [spaceId, setSpaceId] = useState<string | null>(null);
  const [docs, setDocs] = useState<RagDocument[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [indexing, setIndexing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [healthOk, setHealthOk] = useState(false);
  const [newSpaceName, setNewSpaceName] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const chatRef = useRef<HTMLDivElement>(null);

  const active = spaces.find((s) => s.id === spaceId) || null;

  const refreshSpaces = useCallback(async () => {
    const { spaces: list } = await api.listSpaces();
    setSpaces(list);
    if (!spaceId && list[0]) setSpaceId(list[0].id);
  }, [spaceId]);

  const refreshDocs = useCallback(async (id: string) => {
    const { documents } = await api.listDocuments(id);
    setDocs(documents);
  }, []);

  useEffect(() => {
    (async () => {
      try {
        await api.health();
        setHealthOk(true);
        await refreshSpaces();
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
        setHealthOk(false);
      }
    })();
  }, [refreshSpaces]);

  useEffect(() => {
    if (!spaceId) {
      setDocs([]);
      return;
    }
    refreshDocs(spaceId).catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, [spaceId, refreshDocs]);

  useEffect(() => {
    chatRef.current?.scrollTo({ top: chatRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, busy]);

  async function createSpace() {
    const name = newSpaceName.trim() || "Espacio sin nombre";
    setBusy(true);
    setError(null);
    try {
      const { space } = await api.createSpace({ name });
      setNewSpaceName("");
      await refreshSpaces();
      setSpaceId(space.id);
      setMessages([]);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function onFiles(files: FileList | null) {
    if (!files?.length || !spaceId) return;
    const bad = Array.from(files).filter((f) => !isSupportedFilename(f.name));
    if (bad.length) {
      setError(`Formato no soportado: ${bad.map((f) => f.name).join(", ")}`);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api.upload(spaceId, files);
      await refreshDocs(spaceId);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function indexDocs() {
    if (!spaceId) return;
    setIndexing(true);
    setError(null);
    try {
      const r = await api.index(spaceId);
      await refreshDocs(spaceId);
      setMessages([]);
      setError(null);
      alert(`${r.documents} docs · ${r.chunks} chunks indexados`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setIndexing(false);
    }
  }

  async function ask() {
    const q = input.trim();
    if (!q || !spaceId || busy) return;
    const userMsg: ChatMessage = {
      id: newId("msg"),
      role: "user",
      content: q,
      createdAt: new Date().toISOString(),
    };
    setMessages((m) => [...m, userMsg]);
    setInput("");
    setBusy(true);
    setError(null);
    try {
      const res = await api.ask({ question: q, spaceId, k: 4 });
      const asst: ChatMessage = {
        id: newId("msg"),
        role: "assistant",
        content: res.answer,
        sources: res.sources,
        createdAt: new Date().toISOString(),
      };
      setMessages((m) => [...m, asst]);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  const indexed = docs.filter((d) => d.status === "indexed").length;

  return (
    <>
      <div className="ir-orbs" aria-hidden="true">
        <div className="ir-orb ir-orb--cyan" />
        <div className="ir-orb ir-orb--magenta" />
        <div className="ir-orb ir-orb--blue" />
      </div>
      <div className="app-shell">
        <aside className="sidebar">
          <div className="brand">
            <div className="brand-mark">
              <iconify-icon icon="mdi:file-search-outline" width="18" height="18" />
            </div>
            <div>
              <h1>ISA RAG</h1>
              <p>Chat con tus docs</p>
            </div>
          </div>

          {healthOk ? (
            <span className="status-ok">
              <iconify-icon icon="mdi:check-circle" width="14" height="14" /> API lista
            </span>
          ) : (
            <span className="err">API no disponible</span>
          )}

          <div className="panel">
            <p className="section-title">Espacios</p>
            <div className="row" style={{ marginBottom: 6 }}>
              <input
                className="field"
                value={newSpaceName}
                onChange={(e) => setNewSpaceName(e.target.value)}
                placeholder="Nuevo space…"
                onKeyDown={(e) => e.key === "Enter" && createSpace()}
              />
              <button type="button" className="btn secondary" onClick={createSpace} disabled={busy}>
                +
              </button>
            </div>
            <div className="space-list">
              {spaces.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  className={`space-item${s.id === spaceId ? " active" : ""}`}
                  onClick={() => {
                    setSpaceId(s.id);
                    setMessages([]);
                  }}
                >
                  <strong>{s.name}</strong>
                  <span>{s.docCount ?? 0} docs</span>
                </button>
              ))}
              {!spaces.length && <p className="err">Crea un espacio para empezar</p>}
            </div>
          </div>

          <div className="panel panel--docs">
            <p className="section-title">Documentos</p>
            <div
              className="file-drop"
              onClick={() => fileRef.current?.click()}
              onDragOver={(e) => {
                e.preventDefault();
                e.currentTarget.classList.add("drag");
              }}
              onDragLeave={(e) => e.currentTarget.classList.remove("drag")}
              onDrop={(e) => {
                e.preventDefault();
                e.currentTarget.classList.remove("drag");
                onFiles(e.dataTransfer.files);
              }}
            >
              PDF · MD · TXT · DOCX · CSV · HTML
              <br />
              <small>clic o arrastra</small>
            </div>
            <input
              ref={fileRef}
              type="file"
              multiple
              hidden
              accept=".pdf,.txt,.md,.markdown,.csv,.html,.htm,.json,.docx"
              onChange={(e) => onFiles(e.target.files)}
            />
            <ul className="doc-list">
              {docs.map((d) => (
                <li key={d.id}>
                  <span>{d.filename}</span>
                  <span>{d.status}</span>
                </li>
              ))}
            </ul>
            <button
              type="button"
              className="btn block"
              onClick={indexDocs}
              disabled={!spaceId || !docs.length || indexing}
            >
              {indexing ? (
                <>
                  <iconify-icon icon="svg-spinners:ring-resize" width="14" height="14" /> Indexando…
                </>
              ) : indexed ? (
                <>
                  <iconify-icon icon="mdi:check" width="14" height="14" /> Reindexar
                </>
              ) : (
                <>
                  <iconify-icon icon="mdi:database-import" width="14" height="14" /> Indexar
                </>
              )}
            </button>
          </div>
          {error && <p className="err">{error}</p>}
        </aside>

        <main className="main">
          <header className="topbar">
            <div>
              <h2>{active?.name || "ISA RAG"}</h2>
              <p className="caption">RAG · Neon pgvector · neon-glass</p>
            </div>
            <div className="actions">
              <button type="button" className="btn ghost" onClick={toggleTheme} title="Tema">
                <iconify-icon
                  icon={theme === "dark" ? "mdi:white-balance-sunny" : "mdi:moon-waning-crescent"}
                  width="16"
                  height="16"
                />
              </button>
              <button
                type="button"
                className="btn ghost"
                onClick={() => setMessages([])}
                title="Reiniciar chat"
              >
                <iconify-icon icon="mdi:refresh" width="16" height="16" />
              </button>
            </div>
          </header>

          <div className="chat" ref={chatRef}>
            {!messages.length && (
              <div className="empty">
                <iconify-icon icon="mdi:chat-question-outline" width="32" height="32" />
                <p>
                  {spaceId
                    ? "Sube docs, indexa y pregunta. Citas [Fragmento N]."
                    : "Crea o elige un espacio."}
                </p>
              </div>
            )}
            {messages.map((m) => (
              <div key={m.id} className={`msg ${m.role}`}>
                {m.content}
                {m.role === "assistant" && m.sources && <SourcesBlock sources={m.sources} />}
              </div>
            ))}
            {busy && messages.at(-1)?.role === "user" && (
              <div className="msg assistant">
                <iconify-icon icon="svg-spinners:ring-resize" width="16" height="16" /> Buscando…
              </div>
            )}
          </div>

          <div className="composer">
            <textarea
              value={input}
              placeholder={spaceId ? "Pregunta sobre tus docs…" : "Elige un espacio…"}
              disabled={!spaceId || busy}
              rows={1}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  ask();
                }
              }}
            />
            <button
              type="button"
              className="btn"
              onClick={ask}
              disabled={!spaceId || busy || !input.trim()}
            >
              <iconify-icon icon="mdi:send" width="16" height="16" />
            </button>
          </div>
        </main>
      </div>
    </>
  );
}
