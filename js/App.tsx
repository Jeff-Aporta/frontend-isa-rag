import { useCallback, useEffect, useRef, useState } from "react";
import { api, clearSession, getStoredUser, getToken, setSession, ApiError } from "./api.ts";
import { useTheme } from "./theme.ts";
import type { ChatMessage, RagChunk, RagDocument, SourceFragment, Space } from "../shared/types.ts";
import { isSupportedFilename, newId } from "../shared/index.ts";

type MainView = "chat" | "chunks";

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
  const [mainView, setMainView] = useState<MainView>("chat");
  const [selectedDocId, setSelectedDocId] = useState<string | null>(null);
  const [chunks, setChunks] = useState<RagChunk[]>([]);
  const [chunksBusy, setChunksBusy] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editSpaceId, setEditSpaceId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editDesc, setEditDesc] = useState("");
  const [authed, setAuthed] = useState(() => !!getToken());
  const [authUser, setAuthUser] = useState<string | null>(() => getStoredUser());
  const [loginOpen, setLoginOpen] = useState(false);
  const [loginUser, setLoginUser] = useState("admn");
  const [loginPass, setLoginPass] = useState("");
  const chatRef = useRef<HTMLDivElement>(null);

  const active = spaces.find((s) => s.id === spaceId) || null;
  const selectedDoc = docs.find((d) => d.id === selectedDocId) || null;

  const openChunks = useCallback(
    async (doc: RagDocument) => {
      if (!spaceId) return;
      setSelectedDocId(doc.id);
      setMainView("chunks");
      setChunksBusy(true);
      setError(null);
      try {
        const res = await api.listChunks(spaceId, doc.id);
        setChunks(res.chunks);
      } catch (e) {
        setChunks([]);
        if (needAuth(e)) {
          setAuthed(false);
          setLoginOpen(true);
        }
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setChunksBusy(false);
      }
    },
    [spaceId],
  );

  const backToChat = useCallback(() => {
    setMainView("chat");
    setSelectedDocId(null);
    setChunks([]);
  }, []);

  function openEditSpace(s: Space) {
    setEditSpaceId(s.id);
    setEditName(s.name);
    setEditDesc(s.description || "");
    setEditOpen(true);
  }

  async function saveSpaceEdit() {
    if (!editSpaceId) return;
    const name = editName.trim();
    if (!name) {
      setError("El nombre del espacio es obligatorio");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api.updateSpace(editSpaceId, {
        name,
        description: editDesc.trim() || null,
      });
      setEditOpen(false);
      setEditSpaceId(null);
      await refreshSpaces();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function removeSpace(s: Space) {
    if (!confirm(`¿Eliminar el espacio «${s.name}» y todos sus documentos?`)) return;
    setBusy(true);
    setError(null);
    try {
      await api.deleteSpace(s.id);
      if (spaceId === s.id) {
        setSpaceId(null);
        setMessages([]);
        backToChat();
      }
      await refreshSpaces();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

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
        if (getToken()) {
          try {
            const me = await api.me();
            setAuthed(true);
            setAuthUser(String(me.username || getStoredUser() || "admn"));
            await refreshSpaces();
          } catch {
            clearSession();
            setAuthed(false);
            setAuthUser(null);
          }
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
        setHealthOk(false);
      }
    })();
  }, [refreshSpaces]);

  async function doLogin() {
    setBusy(true);
    setError(null);
    try {
      const res = await api.login(loginUser.trim(), loginPass);
      setSession(res.token, res.username);
      setAuthed(true);
      setAuthUser(res.username);
      setLoginOpen(false);
      setLoginPass("");
      await refreshSpaces();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  function doLogout() {
    clearSession();
    setAuthed(false);
    setAuthUser(null);
    setSpaces([]);
    setDocs([]);
    setMessages([]);
    setSpaceId(null);
    backToChat();
  }

  function needAuth(e: unknown): boolean {
    return e instanceof ApiError && e.status === 401;
  }

  useEffect(() => {
    if (!spaceId || !authed) {
      if (!spaceId) {
        setDocs([]);
        backToChat();
      }
      return;
    }
    refreshDocs(spaceId).catch((e) => {
      if (needAuth(e)) {
        setAuthed(false);
        setLoginOpen(true);
      }
      setError(e instanceof Error ? e.message : String(e));
    });
  }, [spaceId, refreshDocs, backToChat, authed]);

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
      if (needAuth(e)) {
        setAuthed(false);
        setLoginOpen(true);
      }
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
      if (needAuth(e)) {
        setAuthed(false);
        setLoginOpen(true);
      }
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
      if (needAuth(e)) {
        setAuthed(false);
        setLoginOpen(true);
      }
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
      if (needAuth(e)) {
        setAuthed(false);
        setLoginOpen(true);
      }
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
            <div className="brand__text">
              <h1>ISA RAG</h1>
              <p>Chat con tus docs</p>
            </div>
            <span
              className={`brand-status${healthOk ? " brand-status--ok" : " brand-status--err"}`}
              title={healthOk ? "API lista" : "API no disponible"}
              aria-label={healthOk ? "API lista" : "API no disponible"}
            >
              <iconify-icon
                icon={healthOk ? "mdi:check-circle" : "mdi:alert-circle"}
                width="16"
                height="16"
              />
            </span>
          </div>

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
                <div
                  key={s.id}
                  className={`space-item${s.id === spaceId ? " active" : ""}`}
                  role="button"
                  tabIndex={0}
                  onClick={() => {
                    setSpaceId(s.id);
                    setMessages([]);
                    backToChat();
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      setSpaceId(s.id);
                      setMessages([]);
                      backToChat();
                    }
                  }}
                >
                  <div className="space-item__body">
                    <strong>{s.name}</strong>
                    <span>{s.docCount ?? 0} docs</span>
                  </div>
                  <div className="space-item__actions" onClick={(e) => e.stopPropagation()}>
                    <button
                      type="button"
                      className="icon-btn"
                      title="Editar espacio"
                      onClick={() => openEditSpace(s)}
                    >
                      <iconify-icon icon="mdi:pencil-outline" width="14" height="14" />
                    </button>
                    <button
                      type="button"
                      className="icon-btn icon-btn--danger"
                      title="Eliminar espacio"
                      onClick={() => removeSpace(s)}
                    >
                      <iconify-icon icon="mdi:trash-can-outline" width="14" height="14" />
                    </button>
                  </div>
                </div>
              ))}
              {!spaces.length && <p className="err">Crea un espacio para empezar</p>}
            </div>
          </div>

          <div className="panel panel--docs">
            <p className="section-title">Documentos</p>
            <label
              className="file-drop"
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
              <input
                className="ir-file-input"
                type="file"
                multiple
                accept=".pdf,.txt,.md,.markdown,.csv,.html,.htm,.json,.docx"
                onChange={(e) => {
                  onFiles(e.target.files);
                  e.target.value = "";
                }}
              />
              <span className="file-drop__text">
                PDF · MD · TXT · DOCX · CSV · HTML
                <small>clic o arrastra</small>
              </span>
            </label>
            <ul className="doc-list">
              {docs.map((d) => (
                <li
                  key={d.id}
                  className={selectedDocId === d.id && mainView === "chunks" ? "active" : undefined}
                  onClick={() => openChunks(d)}
                  title="Ver chunks indexados"
                >
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

          <div className="auth-bar">
            {authed ? (
              <>
                <span className="auth-bar__user" title={authUser || ""}>
                  <iconify-icon icon="mdi:account-circle" width="16" height="16" />
                  {authUser}
                </span>
                <button type="button" className="btn-text" title="Cerrar sesión" onClick={doLogout}>
                  <iconify-icon icon="mdi:logout" width="18" height="18" />
                </button>
              </>
            ) : (
              <button type="button" className="btn block" onClick={() => setLoginOpen(true)}>
                <iconify-icon icon="mdi:login" width="14" height="14" /> Login
              </button>
            )}
          </div>
        </aside>

        <main className="main">
          <header className="topbar">
            <div>
              <h2
                className={mainView === "chat" && active ? "topbar-title--editable" : undefined}
                title={mainView === "chat" && active ? "Doble clic para editar espacio" : undefined}
                onDoubleClick={() => {
                  if (mainView === "chat" && active) openEditSpace(active);
                }}
              >
                {mainView === "chunks" && selectedDoc
                  ? selectedDoc.filename
                  : active?.name || "ISA RAG"}
              </h2>
              <p className="caption">
                {mainView === "chunks"
                  ? `${chunks.length} chunks · vista de fragmentos`
                  : active?.description || "RAG · Neon pgvector · neon-glass"}
              </p>
            </div>
            <div className="actions">
              {mainView === "chunks" && (
                <button type="button" className="btn-text" onClick={backToChat} title="Volver al chat">
                  <iconify-icon icon="mdi:chat-outline" width="18" height="18" />
                </button>
              )}
              <button type="button" className="btn-text" onClick={toggleTheme} title="Tema">
                <iconify-icon
                  icon={theme === "dark" ? "mdi:white-balance-sunny" : "mdi:moon-waning-crescent"}
                  width="18"
                  height="18"
                />
              </button>
              {mainView === "chat" && (
                <button
                  type="button"
                  className="btn-text"
                  onClick={() => setMessages([])}
                  title="Reiniciar chat"
                >
                  <iconify-icon icon="mdi:refresh" width="18" height="18" />
                </button>
              )}
            </div>
          </header>

          {mainView === "chunks" ? (
            <div className="chunks-view">
              {chunksBusy && (
                <div className="chunks-empty">
                  <iconify-icon icon="svg-spinners:ring-resize" width="28" height="28" />
                  <p>Cargando chunks…</p>
                </div>
              )}
              {!chunksBusy && !chunks.length && (
                <div className="chunks-empty">
                  <iconify-icon icon="mdi:file-document-outline" width="28" height="28" />
                  <p>
                    {selectedDoc?.status === "indexed"
                      ? "Sin chunks (reindexa el space)."
                      : "Documento aún no indexado. Pulsa Indexar."}
                  </p>
                </div>
              )}
              {!chunksBusy &&
                chunks.map((c) => (
                  <article className="chunk-card" key={c.id}>
                    <div className="chunk-card__meta">
                      <span className="pill">#{c.chunkIndex}</span>
                      <span className="pill">pág. {c.page ?? "?"}</span>
                      <span>{c.source}</span>
                    </div>
                    <p className="chunk-card__body">{c.content}</p>
                  </article>
                ))}
            </div>
          ) : (
            <>
              <div className="chat" ref={chatRef}>
                {!messages.length && (
                  <div className="empty">
                    <iconify-icon icon="mdi:chat-question-outline" width="32" height="32" />
                    <p>
                      {spaceId
                        ? "Sube docs, indexa y pregunta. Clic en un archivo para ver chunks."
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
            </>
          )}
        </main>
      </div>

      {loginOpen && (
        <div className="modal-backdrop" role="presentation" onClick={() => setLoginOpen(false)}>
          <div
            className="modal glass-panel"
            role="dialog"
            aria-modal="true"
            aria-labelledby="login-title"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 id="login-title">Login</h3>
            <p className="modal-hint">Provisional · JWT</p>
            <label className="modal-field">
              <span>Usuario</span>
              <input
                className="field"
                value={loginUser}
                onChange={(e) => setLoginUser(e.target.value)}
                autoComplete="username"
                autoFocus
              />
            </label>
            <label className="modal-field">
              <span>Contraseña</span>
              <input
                className="field"
                type="password"
                value={loginPass}
                onChange={(e) => setLoginPass(e.target.value)}
                autoComplete="current-password"
                onKeyDown={(e) => e.key === "Enter" && doLogin()}
              />
            </label>
            <div className="modal-actions">
              <button type="button" className="btn ghost" onClick={() => setLoginOpen(false)}>
                Cancelar
              </button>
              <button type="button" className="btn" onClick={doLogin} disabled={busy}>
                Entrar
              </button>
            </div>
          </div>
        </div>
      )}

      {editOpen && (
        <div className="modal-backdrop" role="presentation" onClick={() => setEditOpen(false)}>
          <div
            className="modal glass-panel"
            role="dialog"
            aria-modal="true"
            aria-labelledby="edit-space-title"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 id="edit-space-title">Editar espacio</h3>
            <label className="modal-field">
              <span>Nombre</span>
              <input
                className="field"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                autoFocus
                onKeyDown={(e) => e.key === "Enter" && saveSpaceEdit()}
              />
            </label>
            <label className="modal-field">
              <span>Descripción</span>
              <textarea
                className="field field--area"
                rows={3}
                value={editDesc}
                onChange={(e) => setEditDesc(e.target.value)}
                placeholder="Opcional…"
              />
            </label>
            <div className="modal-actions">
              <button type="button" className="btn ghost" onClick={() => setEditOpen(false)}>
                Cancelar
              </button>
              <button type="button" className="btn" onClick={saveSpaceEdit} disabled={busy}>
                Guardar
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
