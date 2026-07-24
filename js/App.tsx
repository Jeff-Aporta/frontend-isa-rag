import { useCallback, useEffect, useRef, useState } from "react";
import { api, clearSession, getStoredUser, getToken, setSession, ApiError } from "./api.ts";
import { useTheme } from "./theme.ts";
import type {
  ChatMessage,
  QuestionsByFile,
  RagChunk,
  RagDocument,
  ResourceMatch,
  SourceFragment,
  Space,
  SpaceStats,
} from "../shared/types.ts";
import { isSupportedFilename, newId, suggestionsForSpaceName } from "../shared/index.ts";

type MainView = "home" | "chat" | "chunks" | "questions";

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
const [authRole, setAuthRole] = useState<"admin" | "public">("public");
const [loginOpen, setLoginOpen] = useState(false);
const [loginUser, setLoginUser] = useState("jagudeloe");
  const [statsBySpace, setStatsBySpace] = useState<Record<string, SpaceStats>>({});
  const [resourceMatch, setResourceMatch] = useState<ResourceMatch[] | null>(null);
  const [matching, setMatching] = useState(false);
  const [loginPass, setLoginPass] = useState("");
  // — questions-by-file view —
  const [questionsByFile, setQuestionsByFile] = useState<QuestionsByFile | null>(null);
  const [questionsBusy, setQuestionsBusy] = useState(false);
  const chatRef = useRef<HTMLDivElement>(null);

  // —— Layout: panel lateral único (Recursos), ancho persistente ——
  const [asideWidth, setAsideWidth] = useState<number>(() => Number(localStorage.getItem("isa-rag:layout:aside") || 320));
  const [asideOpen, setAsideOpen] = useState<boolean>(() => localStorage.getItem("isa-rag:layout:asideOpen") !== "0");

  useEffect(() => {
    localStorage.setItem("isa-rag:layout:aside", String(asideWidth));
  }, [asideWidth]);
  useEffect(() => {
    localStorage.setItem("isa-rag:layout:asideOpen", asideOpen ? "1" : "0");
  }, [asideOpen]);

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

  const openQuestions = useCallback(async () => {
    if (!spaceId) return;
    setMainView("questions");
    setQuestionsBusy(true);
    setError(null);
    try {
      const res = await api.questionsByFile(spaceId);
      setQuestionsByFile(res);
    } catch (e) {
      setQuestionsByFile(null);
      if (needAuth(e)) {
        setAuthed(false);
        setLoginOpen(true);
      }
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setQuestionsBusy(false);
    }
  }, [spaceId]);

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

  // —— Splitters (drag-to-resize del panel de Recursos) ——
  function startDrag(
    e: React.PointerEvent<HTMLDivElement>,
  ): void {
    const startX = e.clientX;
    const startW = asideWidth;
    const minW = 180;
    const maxW = Math.max(minW + 40, Math.min(520, window.innerWidth - 360));
    const onMove = (ev: PointerEvent) => {
      const dx = ev.clientX - startX;
      const next = Math.max(minW, Math.min(maxW, startW - dx));
      setAsideWidth(next);
    };
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      document.body.style.removeProperty("cursor");
      document.body.style.removeProperty("user-select");
    };
    e.preventDefault();
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }

  const openSpace = useCallback((id: string) => {
    setSpaceId(id);
    setMessages([]);
    setMainView("chat");
    setResourceMatch(null);
    setAsideOpen(true);
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
  }, []);

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
            setAuthUser(String(me.username || getStoredUser() || "jagudeloe"));
            setAuthRole(me.role === "admin" ? "admin" : "public");
          } catch {
            clearSession();
            setAuthed(false);
            setAuthUser(null);
            setAuthRole("public");
          }
        }
        await refreshSpaces();
        await refreshAllStats();
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
      setAuthRole(res.role === "admin" ? "admin" : "public");
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
    setAuthRole("public");
    setSpaces([]);
    setDocs([]);
    setMessages([]);
    setSpaceId(null);
    setMainView("home");
  }

  const canEdit = authRole === "admin";

  function needAuth(e: unknown): boolean {
    return e instanceof ApiError && e.status === 401;
  }

  useEffect(() => {
    if (!spaceId) {
      setDocs([]);
      return;
    }
    refreshDocs(spaceId).catch((e) => {
      if (needAuth(e)) {
        setAuthed(false);
        setLoginOpen(true);
      }
      setError(e instanceof Error ? e.message : String(e));
    });
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
        <header className="app-header">
          <div className="app-header__left">
            <div className="brand-mark brand-mark--inline" aria-hidden="true">
              <iconify-icon icon="mdi:file-search-outline" width="18" height="18" />
            </div>
            <span className="brand-text">ISA RAG</span>
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
            <nav className="main-nav" aria-label="Navegación principal">
              <button
                type="button"
                className={`main-nav__link${mainView === "home" ? " main-nav__link--active" : ""}`}
                onClick={goHome}
                title="Mis espacios"
              >
                <iconify-icon icon="mdi:notebook-multiple" width="16" height="16" />
                <span>Espacios</span>
              </button>
            </nav>
          </div>
          <div className="app-header__right">
            {mainView !== "home" && (
              <button
                type="button"
                className="app-header__icon-btn"
                aria-label={asideOpen ? "Ocultar panel derecho" : "Mostrar panel derecho"}
                aria-pressed={!asideOpen}
                title={asideOpen ? "Ocultar panel derecho" : "Mostrar panel derecho"}
                onClick={() => setAsideOpen((v) => !v)}
              >
                <iconify-icon icon="mdi:auto-fix" width="18" height="18" />
              </button>
            )}
            {authed ? (
              <>
                <span className="auth-bar__user" title={authUser || ""}>
                  <iconify-icon icon="mdi:account-circle" width="16" height="16" />
                  {authUser}
                </span>
                {authRole === "admin" ? (
                  <span className="role-badge role-badge--admin" title="Permisos de administracion: puede agregar / indexar archivos">
                    <iconify-icon icon="mdi:shield-key-outline" width="13" height="13" />
                    admin
                  </span>
                ) : (
                  <span className="role-badge role-badge--public" title="Permisos de solo consulta">
                    <iconify-icon icon="mdi:eye-outline" width="13" height="13" />
                    lectura
                  </span>
                )}
                <button type="button" className="btn-text" title="Cerrar sesión" onClick={doLogout}>
                  <iconify-icon icon="mdi:logout" width="18" height="18" />
                </button>
              </>
            ) : (
              <button type="button" className="btn ghost small" onClick={() => setLoginOpen(true)}>
                <iconify-icon icon="mdi:login" width="14" height="14" /> Login
              </button>
            )}
            <button type="button" className="btn-text" onClick={toggleTheme} title="Tema">
              <iconify-icon
                icon={theme === "dark" ? "mdi:white-balance-sunny" : "mdi:moon-waning-crescent"}
                width="18"
                height="18"
              />
            </button>
          </div>
        </header>

        <div
          className="app-body"
          style={{
            ["--aside-w" as string]:
              mainView !== "home" && asideOpen ? `${asideWidth}px` : "0px",
          }}
        >
          <main className="main">
          {mainView === "home" ? (
            <>
              <header className="topbar">
                <div className="topbar__row topbar__row--caption">
                  <div className="topbar__caption">
                    <p className="caption">
                      {spaces.length} espacios · {canEdit ? "gestiona y abre tus espacios" : "explora y abre cualquier espacio"}
                    </p>
                  </div>
                  <div className="topbar__meta" aria-label="Resumen global">
                    <span className="stat-chip" title="Documentos totales indexados">
                      <iconify-icon icon="mdi:file-document-multiple-outline" width="13" height="13" />
                      {spaces.reduce((acc, s) => acc + (s.docCount ?? 0), 0)} docs
                    </span>
                    <span className="stat-chip" title="Espacios con actividad">
                      <iconify-icon icon="mdi:pulse" width="13" height="13" />
                      {Object.values(statsBySpace).filter((st) => st.total > 0).length} activos
                    </span>
                    {authUser && (
                      <span className="stat-chip" title={`Sesion activa: ${authUser}`}>
                        <iconify-icon icon="mdi:account-circle-outline" width="13" height="13" />
                        {authUser}
                      </span>
                    )}
                  </div>
                </div>
                <div className="topbar__row topbar__row--tools" role="toolbar" aria-label="Herramientas de la home">
                  {canEdit ? (
                    <div className="home__create">
                      <input
                        className="field"
                        value={newSpaceName}
                        onChange={(e) => setNewSpaceName(e.target.value)}
                        placeholder="Nombre del nuevo espacio…"
                        onKeyDown={(e) => e.key === "Enter" && createSpace()}
                        aria-label="Nombre del nuevo espacio"
                      />
                      <button
                        type="button"
                        className="btn"
                        onClick={createSpace}
                        disabled={busy || !newSpaceName.trim()}
                        title="Crear espacio"
                      >
                        <iconify-icon icon="mdi:plus" width="14" height="14" />
                        <span>Crear</span>
                      </button>
                    </div>
                  ) : (
                    <p className="home__readonly-hint">
                      <iconify-icon icon="mdi:lock-outline" width="13" height="13" />
                      Modo lectura · para crear espacios o indexar archivos inicia sesion con un usuario admin
                    </p>
                  )}
                </div>
              </header>

              <div className="home">
                {error && <p className="err home__error">{error}</p>}
                {!spaces.length ? (
                  <div className="home__empty">
                    <iconify-icon icon="mdi:notebook-plus-outline" width="40" height="40" />
                    <p>Crea tu primer espacio para empezar a subir documentos.</p>
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
                          <div
                            className="space-card__actions"
                            onClick={(e) => e.stopPropagation()}
                            onKeyDown={(e) => e.stopPropagation()}
                          >
                            {canEdit && (
                              <>
                                <button
                                  type="button"
                                  className="icon-btn"
                                  title="Editar espacio"
                                  aria-label={`Editar ${s.name}`}
                                  onClick={() => openEditSpace(s)}
                                >
                                  <iconify-icon icon="mdi:pencil-outline" width="14" height="14" />
                                </button>
                                <button
                                  type="button"
                                  className="icon-btn icon-btn--danger"
                                  title="Eliminar espacio"
                                  aria-label={`Eliminar ${s.name}`}
                                  onClick={() => removeSpace(s)}
                                >
                                  <iconify-icon icon="mdi:trash-can-outline" width="14" height="14" />
                                </button>
                              </>
                            )}
                          </div>
                        </article>
                      );
                    })}
                  </div>
                )}
              </div>
            </>
          ) : (
            <>
              <header className="topbar">
                <div className="topbar__row topbar__row--caption">
                  <button
                    type="button"
                    className="btn-text btn-text--back"
                    onClick={goHome}
                    title="Todos los espacios"
                    aria-label="Volver a todos los espacios"
                  >
                    <iconify-icon icon="mdi:arrow-left" width="18" height="18" />
                  </button>
                  <div className="topbar__caption">
                    <h2
                      className={mainView === "chat" && active ? "topbar-title--editable" : undefined}
                      title={mainView === "chat" && active ? "Doble clic para editar espacio" : undefined}
                      onDoubleClick={() => {
                        if (mainView === "chat" && active) openEditSpace(active);
                      }}
                    >
                      {mainView === "chunks" && selectedDoc
                        ? selectedDoc.filename
                        : mainView === "questions"
                        ? "Preguntas por archivo"
                        : active?.name || "ISA RAG"}
                    </h2>
                    <p className="caption">
                      {mainView === "chunks"
                        ? `${chunks.length} chunks · vista de fragmentos`
                        : mainView === "questions"
                        ? `10 preguntas-pattern por archivo — similitud coseno con los embeddings del chunk`
                        : active?.description || "RAG · Neon pgvector · neon-glass"}
                    </p>
                  </div>
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
                <div className="topbar__row topbar__row--tools" role="toolbar" aria-label="Herramientas del espacio">
                  {mainView === "chunks" && (
                    <button type="button" className="btn-text" onClick={backToChat} title="Volver al chat">
                      <iconify-icon icon="mdi:chat-outline" width="18" height="18" />
                      <span>Volver al chat</span>
                    </button>
                  )}
                  {mainView === "chat" && (
                    <button
                      type="button"
                      className="btn-text"
                      onClick={() => setMessages([])}
                      title="Reiniciar chat"
                    >
                      <iconify-icon icon="mdi:refresh" width="18" height="18" />
                      <span>Reiniciar</span>
                    </button>
                  )}
                  {(mainView === "chat" || mainView === "questions") && active && (
                    <button
                      type="button"
                      className="btn-text"
                      onClick={() => {
                        if (mainView === "questions") backToChat();
                        else openQuestions();
                      }}
                      title={mainView === "questions" ? "Volver a archivos y chat" : "Ver las 10 preguntas relacionadas a cada archivo"}
                    >
                      <iconify-icon
                        icon={mainView === "questions" ? "mdi:file-document-multiple-outline" : "mdi:comment-question-outline"}
                        width="18"
                        height="18"
                      />
                      <span>{mainView === "questions" ? "Archivos" : "Preguntas"}</span>
                    </button>
                  )}
                  {mainView === "chunks" && (
                    <button
                      type="button"
                      className="btn-text"
                      onClick={() => active && void openQuestions()}
                      title="Ver las 10 preguntas relacionadas a cada archivo"
                    >
                      <iconify-icon icon="mdi:comment-question-outline" width="18" height="18" />
                      <span>Preguntas</span>
                    </button>
                  )}
                  <button type="button" className="btn-text" onClick={toggleTheme} title="Tema">
                    <iconify-icon
                      icon={theme === "dark" ? "mdi:white-balance-sunny" : "mdi:moon-waning-crescent"}
                      width="18"
                      height="18"
                    />
                    <span>Tema</span>
                  </button>
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
              ) : mainView === "questions" ? (
                <div className="questions-view">
                  {questionsBusy && (
                    <div className="questions-empty">
                      <iconify-icon icon="svg-spinners:ring-resize" width="28" height="28" />
                      <p>Cargando preguntas relacionadas…</p>
                    </div>
                  )}
                  {!questionsBusy && questionsByFile && questionsByFile.files.length === 0 && (
                    <div className="questions-empty">
                      <iconify-icon icon="mdi:comment-question-outline" width="28" height="28" />
                      <p>
                        Este espacio aún no tiene archivos indexados con embeddings. Sube un documento o ingesta un video para ver las preguntas relacionadas.
                      </p>
                    </div>
                  )}
                  {!questionsBusy && questionsByFile && questionsByFile.files.length > 0 && (
                    <>
                      <div className="questions-summary">
                        <p className="section-title">Preguntas por archivo</p>
                        <span className="pill pill--ghost">
                          {questionsByFile.files.length} archivos · {questionsByFile.files.reduce((s, f) => s + f.questions.length, 0)} preguntas
                        </span>
                      </div>
                      <div className="questions-grid">
                        {questionsByFile.files.map((entry) => (
                          <article className="questions-card" key={`${entry.file.kind}:${entry.file.id}`}>
                            <header className="questions-card__head">
                              <iconify-icon
                                icon={entry.file.kind === "youtube" ? "mdi:youtube" : "mdi:file-document-outline"}
                                width="18"
                                height="18"
                              />
                              <h3 className="questions-card__title" title={entry.file.name}>
                                {entry.file.name}
                              </h3>
                            </header>
                            {!entry.centroidComputed ? (
                              <p className="questions-card__empty">
                                <iconify-icon icon="mdi:lock-outline" width="14" height="14" /> Sin embeddings en este archivo.
                              </p>
                            ) : !entry.questions.length ? (
                              <p className="questions-card__empty">Aún no hay preguntas-pattern en este espacio.</p>
                            ) : (
                              <ol className="questions-list">
                                {entry.questions.map((q, i) => (
                                  <li key={q.id} className="questions-list__item">
                                    <span className="questions-list__num">{i + 1}</span>
                                    <p className="questions-list__text">{q.text}</p>
                                    <span className="questions-list__score" title={`score ${q.score.toFixed(3)}`}>
                                      {(q.score * 100).toFixed(0)}%
                                    </span>
                                  </li>
                                ))}
                              </ol>
                            )}
                          </article>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              ) : (
                <>
                  <section className="docs-panel" aria-label="Documentos del espacio">
                    <div className="docs-panel__head">
                      <p className="section-title">Documentos</p>
                      <span className="docs-panel__count">
                        {indexed}/{docs.length} indexados
                      </span>
                      {!canEdit && authed && (
                        <span className="pill pill--ghost" title="Solo administradores pueden subir archivos">
                          <iconify-icon icon="mdi:lock-outline" width="12" height="12" /> solo admin
                        </span>
                      )}
                    </div>
                    {canEdit ? (
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
                    ) : (
                      <div className="file-drop file-drop--readonly" aria-disabled="true">
                        <iconify-icon icon="mdi:lock-outline" width="22" height="22" />
                        <span className="file-drop__text">
                          Subida deshabilitada
                          <small>solo administradores pueden agregar archivos</small>
                        </span>
                      </div>
                    )}
                    <ul className="doc-list">
                      {docs.map((d) => (
                        <li
                          key={d.id}
                          className={selectedDocId === d.id ? "active" : undefined}
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
                      disabled={!spaceId || !docs.length || indexing || !canEdit}
                      title={canEdit ? "Indexar / reindexar" : "Solo administradores pueden indexar"}
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
                    {error && <p className="err docs-panel__error">{error}</p>}
                  </section>

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

          {mainView !== "home" && asideOpen && (
            <div
              className="splitter splitter--aside"
              role="separator"
              aria-orientation="vertical"
              aria-label="Redimensionar panel derecho"
              onPointerDown={(e) => startDrag(e)}
            >
              <span className="splitter__grip" aria-hidden="true" />
            </div>
          )}

          {mainView !== "home" && (
            <aside
              className="app-aside"
              aria-hidden={!asideOpen}
            >
              <div className="app-aside__inner">
                <h3 className="home__heading">
                  <iconify-icon icon="mdi:auto-fix" width="20" height="20" />
                  Crear recurso
                </h3>
                <p className="home__aside-hint">
                  Recurso activo: <strong>{active?.name || "(ninguno)"}</strong>
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
              </div>
            </aside>
          )}
        </div>
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
