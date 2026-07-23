import { useCallback, useEffect, useRef, useState } from "react";
import { api, clearSession, getStoredUser, getToken, setSession, ApiError } from "./api.ts";
import { useTheme } from "./theme.ts";
import type {
  ChatMessage,
  RagChunk,
  RagDocument,
  ResourceMatch,
  SourceFragment,
  Space,
  SpaceStats,
} from "../shared/types.ts";
import { isSupportedFilename, newId, suggestionsForSpaceName } from "../shared/index.ts";

type MainView = "home" | "chat" | "chunks";

interface ResourceTemplate {
  id: string;
  title: string;
  description: string;
  icon: string;
}

const RESOURCE_TEMPLATES: ResourceTemplate[] = [
  { id: "quiz", title: "Cuestionario", description: "Genera preguntas sobre tus documentos", icon: "mdi:help-circle-outline" },
  { id: "podcast", title: "Podcast", description: "Conversación de audio entre dos IA", icon: "mdi:microphone-outline" },
  { id: "summary", title: "Resumen", description: "Síntesis ejecutiva del contenido", icon: "mdi:text-short" },
  { id: "mindmap", title: "Mapa mental", description: "Ideas clave conectadas visualmente", icon: "mdi:graph-outline" },
  { id: "briefing", title: "Informe", description: "Documento estructurado en Markdown", icon: "mdi:file-document-outline" },
  { id: "flashcards", title: "Tarjetas", description: "Repaso rápido pregunta/respuesta", icon: "mdi:card-outline" },
];

function SourcesBlock({ sources }: { sources: SourceFragment[] }) {
  if (!sources.length) return null;
  return (
    <details className="sources" open>
      <summary>
        <iconify-icon icon="mdi:book-open-page-variant" width="14" height="14" /> Fuentes (
        {sources.length})
      </summary>
      {sources.map((s) => {
        const yt = s.meta?.youtubeVideoId;
        const start = s.meta?.youtubeStartMs ?? 0;
        const url =
          s.meta?.youtubeUrl ??
          (yt ? `https://youtu.be/${yt}?t=${Math.floor(start / 1000)}` : undefined);
        return (
          <div className="fragment" key={`${s.index}-${s.source}-${yt ?? s.page}`}>
            <strong>
              Fragmento {s.index} — {s.source} —{" "}
              {yt ? (
                <>
                  <span className="pill">▶︎ {s.meta?.title ?? yt}</span>{" "}
                  <span className="pill">{s.page}</span>{" "}
                  <a href={url} target="_blank" rel="noreferrer">
                    abrir en YouTube ↗
                  </a>
                </>
              ) : (
                <>pág. {s.page}</>
              )}
            </strong>
            <p>{s.content}</p>
          </div>
        );
      })}
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
  const [mainView, setMainView] = useState<MainView>("home");
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
const [statsBySpace, setStatsBySpace] = useState<Record<string, SpaceStats>>({});
const [resourceMatch, setResourceMatch] = useState<ResourceMatch[] | null>(null);
const [matching, setMatching] = useState(false);
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

  const goHome = useCallback(() => {
    setMainView("home");
    setSelectedDocId(null);
    setChunks([]);
    setResourceMatch(null);
  }, []);

  const suggestResources = useCallback(async () => {
    if (!spaceId) return;
    const lastUser = [...messages].reverse().find((m) => m.role === "user")?.content || "";
    const q = input.trim() || lastUser.trim();
    if (!q) return;
    setMatching(true);
    try {
      const res = await api.matchResources(spaceId, q, 3);
      setResourceMatch(res.matches);
    } catch (e) {
      if (needAuth(e)) {
        setAuthed(false);
        setLoginOpen(true);
      }
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setMatching(false);
    }
  }, [spaceId, input, messages]);

  const openSpace = useCallback((id: string) => {
    setSpaceId(id);
    setMessages([]);
    setMainView("chat");
    setResourceMatch(null);
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
        setMainView("home");
      }
      await refreshSpaces();
      await refreshAllStats();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  const refreshSpaces = useCallback(async () => {
    const { spaces: list } = await api.listSpaces();
    setSpaces(list);
  }, []);

  const refreshAllStats = useCallback(async () => {
    if (!authed) return;
    try {
      const { spaces: list } = await api.listSpaces();
      const entries = await Promise.all(
        list.map(async (s): Promise<[string, SpaceStats | null]> => {
          try {
            const { stats } = await api.spaceStats(s.id);
            return [s.id, stats];
          } catch {
            return [s.id, null];
          }
        }),
      );
      const next: Record<string, SpaceStats> = {};
      for (const [id, s] of entries) if (s) next[id] = s;
      setStatsBySpace(next);
    } catch {
      /* best-effort */
    }
  }, [authed]);

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
            await refreshAllStats();
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
  }, [refreshSpaces, refreshAllStats]);

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
      await refreshAllStats();
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
    setMainView("home");
  }

  function needAuth(e: unknown): boolean {
    return e instanceof ApiError && e.status === 401;
  }

  useEffect(() => {
    if (!spaceId || !authed) {
      if (!spaceId) setDocs([]);
      return;
    }
    refreshDocs(spaceId).catch((e) => {
      if (needAuth(e)) {
        setAuthed(false);
        setLoginOpen(true);
      }
      setError(e instanceof Error ? e.message : String(e));
    });
  }, [spaceId, refreshDocs, authed]);

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
      await refreshAllStats();
      openSpace(space.id);
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
      await refreshAllStats();
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
      await refreshAllStats();
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
                  className={`space-item${s.id === spaceId && mainView !== "home" ? " active" : ""}`}
                  role="button"
                  tabIndex={0}
                  onClick={() => openSpace(s.id)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      openSpace(s.id);
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
          {mainView === "home" ? (
            <>
              <header className="topbar">
                <div>
                  <h2>ISA RAG</h2>
                  <p className="caption">Tus espacios de conocimiento · {spaces.length} en total</p>
                </div>
                <div className="actions">
                  <button type="button" className="btn-text" onClick={toggleTheme} title="Tema">
                    <iconify-icon
                      icon={theme === "dark" ? "mdi:white-balance-sunny" : "mdi:moon-waning-crescent"}
                      width="18"
                      height="18"
                    />
                  </button>
                </div>
              </header>

              <div className="home">
                <section className="home__main">
                  <h3 className="home__heading">
                    <iconify-icon icon="mdi:notebook-outline" width="20" height="20" />
                    Espacios
                  </h3>
                  {!spaces.length ? (
                    <div className="home__empty">
                      <iconify-icon icon="mdi:notebook-plus-outline" width="40" height="40" />
                      <p>Crea tu primer espacio desde el panel izquierdo para empezar.</p>
                    </div>
                  ) : (
                    <div className="home__grid">
                      {spaces.map((s) => {
                        const st = statsBySpace[s.id];
                        return (
                          <article
                            key={s.id}
                            className="space-card"
                            role="button"
                            tabIndex={0}
                            onClick={() => openSpace(s.id)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter" || e.key === " ") {
                                e.preventDefault();
                                openSpace(s.id);
                              }
                            }}
                          >
                            <div className="space-card__cover" aria-hidden="true">
                              <iconify-icon icon="mdi:file-search-outline" width="28" height="28" />
                            </div>
                            <div className="space-card__body">
                              <h4>{s.name}</h4>
                              <p className="space-card__desc">
                                {s.description || "Sin descripción"}
                              </p>
                            </div>
                            <div className="space-card__meta">
                              <span className="pill">{s.docCount ?? 0} docs</span>
                              <span className="pill pill--ghost">abrir →</span>
                            </div>
                            <div className="space-card__stats" aria-label="Estadísticas del espacio">
                              {st ? (
                                <>
                                  <span className="stat-chip" title="Eventos totales">
                                    <iconify-icon icon="mdi:pulse" width="12" height="12" />
                                    {st.total}
                                  </span>
                                  {st.perEvent.ask > 0 && (
                                    <span className="stat-chip" title="Preguntas">
                                      <iconify-icon icon="mdi:chat-question-outline" width="12" height="12" />
                                      {st.perEvent.ask}
                                    </span>
                                  )}
                                  {st.topUsers[0] && (
                                    <span className="stat-chip" title={`Top usuario: ${st.topUsers[0].username}`}>
                                      <iconify-icon icon="mdi:account-star-outline" width="12" height="12" />
                                      {st.topUsers[0].username}
                                    </span>
                                  )}
                                </>
                              ) : (
                                <span className="stat-chip stat-chip--muted">sin actividad</span>
                              )}
                            </div>
                          </article>
                        );
                      })}
                    </div>
                  )}
                </section>

                <aside className="home__aside" aria-label="Crear recurso">
                  <h3 className="home__heading">
                    <iconify-icon icon="mdi:auto-fix" width="20" height="20" />
                    Crear recurso
                  </h3>
                  <p className="home__aside-hint">
                    Elige un espacio activo para generar contenido a partir de tus documentos.
                  </p>
                  <div className="resource-list">
                    {RESOURCE_TEMPLATES.map((t) => (
                      <button
                        key={t.id}
                        type="button"
                        className="resource-btn"
                        disabled={!active}
                        title={active ? t.description : "Selecciona un espacio primero"}
                      >
                        <span className="resource-btn__icon" aria-hidden="true">
                          <iconify-icon icon={t.icon} width="18" height="18" />
                        </span>
                        <span className="resource-btn__body">
                          <strong>{t.title}</strong>
                          <span className="resource-btn__desc">{t.description}</span>
                        </span>
                        <iconify-icon
                          icon={active ? "mdi:plus-circle-outline" : "mdi:lock-outline"}
                          width="16"
                          height="16"
                        />
                      </button>
                    ))}
                  </div>
                </aside>
              </div>
            </>
          ) : (
            <>
              <header className="topbar">
                <div>
                  <button
                    type="button"
                    className="btn-text btn-text--back"
                    onClick={goHome}
                    title="Todos los espacios"
                    aria-label="Volver a todos los espacios"
                  >
                    <iconify-icon icon="mdi:arrow-left" width="18" height="18" />
                  </button>
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
                  {mainView !== "chunks" && active && statsBySpace[active.id] && (
                    <div className="topbar-stats" aria-label="Estadísticas del espacio">
                      <span className="stat-chip" title="Eventos totales">
                        <iconify-icon icon="mdi:pulse" width="12" height="12" />
                        {statsBySpace[active.id].total}
                      </span>
                      {statsBySpace[active.id].perEvent.ask > 0 && (
                        <span className="stat-chip" title="Preguntas (ask)">
                          <iconify-icon icon="mdi:chat-question-outline" width="12" height="12" />
                          {statsBySpace[active.id].perEvent.ask} preguntas
                        </span>
                      )}
                      {statsBySpace[active.id].perEvent.upload > 0 && (
                        <span className="stat-chip" title="Archivos subidos">
                          <iconify-icon icon="mdi:upload-outline" width="12" height="12" />
                          {statsBySpace[active.id].perEvent.upload} archivos
                        </span>
                      )}
                      {statsBySpace[active.id].perEvent.index > 0 && (
                        <span className="stat-chip" title="Reindexaciones">
                          <iconify-icon icon="mdi:cog-outline" width="12" height="12" />
                          {statsBySpace[active.id].perEvent.index} reindex
                        </span>
                      )}
                      {statsBySpace[active.id].topUsers[0] && (
                        <span className="stat-chip" title={`Top usuario: ${statsBySpace[active.id].topUsers[0].username} (${statsBySpace[active.id].topUsers[0].count} eventos)`}>
                          <iconify-icon icon="mdi:account-star-outline" width="12" height="12" />
                          top: {statsBySpace[active.id].topUsers[0].username} ·
                          {" "}{statsBySpace[active.id].topUsers[0].count}
                        </span>
                      )}
                    </div>
                  )}
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

                  <div className="suggestions" aria-label="Preguntas sugeridas">
                    {suggestionsForSpaceName(active?.name).map((q) => (
                      <button
                        key={q}
                        type="button"
                        className="suggestion-pill"
                        onClick={() => setInput(q)}
                        disabled={!spaceId || busy}
                        title={q}
                      >
                        <iconify-icon icon="mdi:lightbulb-on-outline" width="14" height="14" />
                        <span>{q}</span>
                      </button>
                    ))}
                  </div>

                  <div className="resource-match" aria-label="Recursos sugeridos">
                    <button
                      type="button"
                      className="resource-match__trigger"
                      onClick={suggestResources}
                      disabled={!spaceId || matching || busy}
                      title={
                        input.trim()
                          ? `Buscar recursos afines a la pregunta`
                          : "Buscar recursos afines a la última pregunta"
                      }
                    >
                      <iconify-icon
                        icon={matching ? "svg-spinners:ring-resize" : "mdi:auto-fix-outline"}
                        width="14"
                        height="14"
                      />
                      {matching ? "buscando recursos…" : "Recursos sugeridos"}
                    </button>
                    {resourceMatch && resourceMatch.length === 0 && (
                      <span className="resource-match__empty">
                        Sin recursos entrenados todavía para este espacio.
                      </span>
                    )}
                    {resourceMatch && resourceMatch.length > 0 && (
                      <div className="resource-match__pills">
                        {resourceMatch.map((m) => (
                          <div key={m.resourceId} className="rm-pill" title={m.description}>
                            <span className="rm-pill__icon" aria-hidden="true">
                              <iconify-icon icon={m.icon} width="14" height="14" />
                            </span>
                            <span className="rm-pill__title">{m.title}</span>
                            <span className="rm-pill__score">
                              {(m.score * 100).toFixed(0)}%
                            </span>
                          </div>
                        ))}
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
