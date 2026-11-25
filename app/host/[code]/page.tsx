"use client";
import QRCode from "qrcode";
import { use, useEffect, useRef, useState } from "react";
import Confetti from "@/components/Confetti";
import { GameState, hostKeyFor, ls, post, useCountdown, useGame } from "@/lib/client";

export default function HostPage({ params }: { params: Promise<{ code: string }> }) {
  const code = use(params).code.toUpperCase();
  const [hostKey, setHostKey] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setHostKey(ls.get(hostKeyFor(code)));
    setReady(true);
  }, [code]);

  const { state, error, refresh, now } = useGame(code, { hostKey, ms: 1200 });
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function act(action: string, extra: Record<string, unknown> = {}) {
    if (!hostKey) return;
    setBusy(true);
    setActionError(null);
    try {
      await post(`/api/rooms/${code}/host`, { action, ...extra }, hostKey);
      await refresh();
    } catch (e) {
      setActionError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (!ready) return null;

  if (!hostKey) {
    return (
      <main className="wrap">
        <div className="card stack">
          <h2>Esta pantalla es para quien dirige el juego</h2>
          <p>Abre esta página en el mismo navegador donde creaste la sala. Si quieres jugar, entra como participante.</p>
          <a className="btn sun block" href={`/play/${code}`}>
            Entrar a jugar
          </a>
        </div>
      </main>
    );
  }

  if (!state) {
    return (
      <main className="wrap wide">
        {error ? <div className="error">{error}</div> : <p className="on-muted">Cargando sala…</p>}
      </main>
    );
  }

  return (
    <main className="wrap wide">
      <div className="topbar">
        <div className="brand">
          <span className="dot">?</span> {state.title}
        </div>
        <div className="row">
          {state.phase !== "lobby" && state.phase !== "final" && (
            <span className="pill">
              Dato {state.index + 1} / {state.total}
            </span>
          )}
          <span className="pill sun">Sala {code}</span>
        </div>
      </div>
      {error && <div className="banner">{error}</div>}
      {actionError && <div className="banner">{actionError}</div>}
      {state.host && !state.host.database && process.env.NODE_ENV === "production" && (
        <div className="banner">
          Falta conectar la base de datos en Vercel. Sin ella el juego no funciona bien con varias personas.
        </div>
      )}

      {state.phase === "lobby" && <Lobby state={state} code={code} act={act} busy={busy} />}
      {state.phase === "question" && <Question state={state} now={now} act={act} busy={busy} />}
      {state.phase === "reveal" && <Reveal state={state} act={act} busy={busy} />}
      {state.phase === "final" && <Final state={state} act={act} busy={busy} />}
    </main>
  );
}

type Act = (action: string, extra?: Record<string, unknown>) => Promise<void>;

function useJoinUrl(code: string) {
  const [url, setUrl] = useState("");
  const [qr, setQr] = useState("");
  useEffect(() => {
    const u = `${window.location.origin}/play/${code}`;
    setUrl(u);
    QRCode.toDataURL(u, { margin: 1, width: 420, color: { dark: "#1b1035", light: "#ffffff" } }).then(setQr);
  }, [code]);
  return { url, qr };
}

function Lobby({ state, code, act, busy }: { state: GameState; code: string; act: Act; busy: boolean }) {
  const { url, qr } = useJoinUrl(code);
  const [showFacts, setShowFacts] = useState(false);
  const [rounds, setRounds] = useState<number | "all">("all");
  const [copied, setCopied] = useState(false);
  const facts = state.host?.facts ?? [];
  const n = facts.length;
  const planned = rounds === "all" ? n : Math.min(rounds, n);
  // ~30 s de votación + ~25 s de revelación y comentarios
  const minutes = Math.round((planned * (state.roundSeconds + 25)) / 60);

  return (
    <div className="host-grid">
      <section>
        <h1 className="hero-title" style={{ marginTop: 6 }}>
          Entra y manda <span>tu dato curioso</span>
        </h1>
        <div className="join-box" style={{ marginTop: 18 }}>
          <div className="qr">{qr && <img src={qr} alt="Código QR para entrar al juego" />}</div>
          <div>
            <div className="on-muted" style={{ fontWeight: 700 }}>
              Escanea el QR o entra a
            </div>
            <div style={{ fontSize: 22, fontWeight: 800, margin: "4px 0 10px", wordBreak: "break-all" }}>
              {url.replace(/^https?:\/\//, "")}
            </div>
            <div className="on-muted" style={{ fontWeight: 700 }}>
              Código
            </div>
            <div className="room-code">{code}</div>
            <button
              className="btn ghost-light"
              style={{ marginTop: 12 }}
              onClick={() => {
                navigator.clipboard?.writeText(url).then(() => {
                  setCopied(true);
                  setTimeout(() => setCopied(false), 1500);
                });
              }}
            >
              {copied ? "¡Copiado!" : "Copiar link para el chat"}
            </button>
          </div>
        </div>

        <div className="row" style={{ gap: 30, margin: "30px 0 16px" }}>
          <div>
            <div className="stat">{state.players.length}</div>
            <div className="on-muted">en la sala</div>
          </div>
          <div>
            <div className="stat" style={{ color: "var(--mint)" }}>
              {n}
            </div>
            <div className="on-muted">datos listos</div>
          </div>
        </div>
        <div className="chips">
          {state.players.map((p) => (
            <span key={p.id} className={`chip ${p.hasFact ? "done" : ""}`}>
              {p.hasFact ? "✓ " : ""}
              {p.name}
            </span>
          ))}
          {state.players.length === 0 && <span className="on-muted">Esperando a que entre la gente…</span>}
        </div>
      </section>

      <aside className="stack">
        <div className="card stack">
          <h3>Configurar</h3>
          <div>
            <span className="label">Segundos para votar</span>
            <div className="seg">
              {[20, 30, 45, 60].map((s) => (
                <button
                  key={s}
                  className={state.roundSeconds === s ? "on" : ""}
                  onClick={() => act("settings", { roundSeconds: s })}
                  disabled={busy}
                >
                  {s}s
                </button>
              ))}
            </div>
          </div>
          <div>
            <span className="label">¿Cuántos datos jugar?</span>
            <div className="seg">
              {([10, 15, 20, "all"] as const).map((r) => (
                <button key={r} className={rounds === r ? "on" : ""} onClick={() => setRounds(r)}>
                  {r === "all" ? "Todos" : r}
                </button>
              ))}
            </div>
          </div>
          <p style={{ margin: 0 }}>
            {planned > 0
              ? `Se jugarán ${planned} datos, unos ${minutes} minutos.`
              : "Cuando la gente mande sus datos verás aquí cuánto dura."}
          </p>
          <button
            className="btn sun big block"
            disabled={busy || n < 2}
            onClick={() => act("start", { maxRounds: rounds === "all" ? undefined : rounds })}
          >
            ¡Empezar el juego!
          </button>
          {n < 2 && <p style={{ margin: 0, fontSize: 14 }}>Se necesitan al menos 2 datos.</p>}
        </div>

        <div className="card stack">
          <div className="row" style={{ justifyContent: "space-between" }}>
            <h3>Datos recibidos</h3>
            <button className="btn ghost" style={{ padding: "8px 12px", fontSize: 14 }} onClick={() => setShowFacts(!showFacts)}>
              {showFacts ? "Ocultar" : "Revisar"}
            </button>
          </div>
          {showFacts ? (
            <>
              <p style={{ margin: 0, fontSize: 14 }}>
                No compartas pantalla mientras los revisas. Puedes quitar los que no sirvan.
              </p>
              <ul className="facts-list">
                {facts.map((f) => (
                  <li key={f.id}>
                    <div>
                      <b>{f.name}</b>
                      {f.text}
                    </div>
                    <button className="x" onClick={() => act("removeFact", { playerId: f.id })} disabled={busy}>
                      Quitar
                    </button>
                  </li>
                ))}
                {facts.length === 0 && <li>Todavía no hay datos.</li>}
              </ul>
            </>
          ) : (
            <p style={{ margin: 0 }}>Ocultos para no hacer spoiler si estás compartiendo pantalla.</p>
          )}
        </div>
      </aside>
    </div>
  );
}

function Ring({ left, total }: { left: number; total: number }) {
  const r = 64;
  const c = 2 * Math.PI * r;
  const frac = total ? left / total : 0;
  const color = frac > 0.5 ? "var(--mint)" : frac > 0.2 ? "var(--sun)" : "var(--coral)";
  return (
    <div className="ring" aria-label={`${Math.ceil(left)} segundos`}>
      <svg width="150" height="150" viewBox="0 0 150 150">
        <circle cx="75" cy="75" r={r} stroke="rgba(255,255,255,.12)" strokeWidth="12" fill="none" />
        <circle
          cx="75"
          cy="75"
          r={r}
          stroke={color}
          strokeWidth="12"
          fill="none"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - frac)}
          style={{ transition: "stroke-dashoffset .25s linear" }}
        />
      </svg>
      <div className="num">{Math.ceil(left)}</div>
    </div>
  );
}

function Question({ state, now, act, busy }: { state: GameState; now: () => number; act: Act; busy: boolean }) {
  const left = useCountdown(state, now);
  const fired = useRef<number | null>(null);
  const everyone = state.votesCount >= state.eligibleVoters && state.eligibleVoters > 0;

  const actRef = useRef(act);
  actRef.current = act;

  // Revela solo cuando se acaba el tiempo o cuando ya votaron todos.
  useEffect(() => {
    const due = left <= 0 && now() >= state.roundStartedAt + state.roundSeconds * 1000;
    if ((due || everyone) && fired.current !== state.index) {
      fired.current = state.index;
      setTimeout(() => actRef.current("reveal"), due ? 600 : 1200);
    }
  }, [left, everyone, state.index, state.roundStartedAt, state.roundSeconds, now]);

  return (
    <div>
      <div className="row" style={{ justifyContent: "space-between", alignItems: "flex-start", gap: 30 }}>
        <div style={{ flex: 1 }}>
          <p className="on-muted" style={{ fontSize: 22, fontWeight: 700, margin: "4px 0 16px" }}>
            ¿De quién es este dato?
          </p>
          <div className="fact-bubble host-fact">{state.currentFact}</div>
        </div>
        <div className="center">
          <Ring left={left} total={state.roundSeconds} />
          <div style={{ marginTop: 14 }}>
            <div className="stat" style={{ fontSize: 44 }}>
              {state.votesCount}
              <span className="on-muted" style={{ fontSize: 26 }}>
                /{state.eligibleVoters}
              </span>
            </div>
            <div className="on-muted">votaron</div>
          </div>
        </div>
      </div>
      <div className="row" style={{ marginTop: 50, gap: 12, flexWrap: "wrap" }}>
        <button className="btn sun big" onClick={() => act("reveal")} disabled={busy}>
          Revelar ya
        </button>
        <button className="btn ghost-light" onClick={() => act("end")} disabled={busy}>
          Terminar juego
        </button>
      </div>
    </div>
  );
}

function Reveal({ state, act, busy }: { state: GameState; act: Act; busy: boolean }) {
  const r = state.reveal!;
  const max = Math.max(1, ...r.tallies.map((t) => t.count));
  const last = state.index + 1 >= state.total;
  const top = state.leaderboard.slice(0, 5);
  const share = r.totalVotes ? Math.round((r.correct.length / r.totalVotes) * 100) : 0;
  return (
    <div>
      <Confetti count={70} />
      <div className="host-grid">
        <section>
          <div className="fact-bubble" style={{ fontSize: 24, marginBottom: 34 }}>
            {state.currentFact}
          </div>
          <div className="on-muted" style={{ fontSize: 22, fontWeight: 700 }}>
            Era de…
          </div>
          <div className="owner-reveal">{r.ownerName}</div>
          <p className="on-muted" style={{ fontSize: 20, marginTop: 14 }}>
            {r.totalVotes === 0
              ? "Nadie votó en esta ronda."
              : r.correct.length === 0
                ? `¡Nadie lo adivinó! Engañó a las ${r.totalVotes} personas que votaron.`
                : `${r.correct.length} de ${r.totalVotes} lo adivinaron (${share}%).${
                    r.correct[0] ? ` El más rápido: ${r.correct[0]}.` : ""
                  }`}
          </p>
          {r.tallies.length > 0 && (
            <div className="bars" style={{ marginTop: 20 }}>
              {r.tallies.slice(0, 6).map((t) => (
                <div key={t.id} className={`bar ${t.id === r.ownerId ? "win" : ""}`}>
                  <span className="nm">
                    {t.id === r.ownerId ? "✓ " : ""}
                    {t.name}
                  </span>
                  <div className="track">
                    <div className="fill" style={{ width: `${(t.count / max) * 100}%` }} />
                  </div>
                  <span>{t.count}</span>
                </div>
              ))}
            </div>
          )}
        </section>
        <aside>
          <h3 style={{ margin: "0 0 12px", fontSize: 22 }}>Tabla de posiciones</h3>
          <ol className="board">
            {top.map((row, i) => (
              <li key={row.id}>
                <span className="pos">{i + 1}</span>
                <span>{row.name}</span>
                <span>{row.score}</span>
              </li>
            ))}
          </ol>
          <div className="row" style={{ marginTop: 24, gap: 12, flexWrap: "wrap" }}>
            <button className="btn sun big" onClick={() => act("next")} disabled={busy}>
              {last ? "Ver resultados finales" : "Siguiente dato →"}
            </button>
            {!last && (
              <button className="btn ghost-light" onClick={() => act("end")} disabled={busy}>
                Terminar aquí
              </button>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}

function Final({ state, act, busy }: { state: GameState; act: Act; busy: boolean }) {
  const [a, b, c] = state.leaderboard;
  const aw = state.awards;
  const col = (row: typeof a | undefined, place: number, h: number, bg: string) =>
    row ? (
      <div className="col">
        <div className="nm">{row.name}</div>
        <div className="pts">{row.score} pts</div>
        <div className="block" style={{ height: h, background: bg }}>
          {place}
        </div>
      </div>
    ) : (
      <div />
    );
  return (
    <div>
      <Confetti count={140} />
      <h1 className="hero-title center" style={{ marginTop: 0 }}>
        ¡Y los ganadores <span>son…!</span>
      </h1>
      <div className="podium" style={{ maxWidth: 760, margin: "26px auto" }}>
        {col(b, 2, 150, "#d8d3e8")}
        {col(a, 1, 210, "var(--sun)")}
        {col(c, 3, 110, "#f0a36b")}
      </div>
      {aw && (
        <div className="awards" style={{ marginTop: 30 }}>
          {aw.detective && (
            <div className="award">
              <div className="ic">🕵️</div>
              <h4>Detective del equipo</h4>
              <div className="who">{aw.detective.name}</div>
              <div className="q">
                Adivinó {aw.detective.hits} de {aw.detective.rounds}
              </div>
            </div>
          )}
          {aw.mystery && (
            <div className="award">
              <div className="ic">🎭</div>
              <h4>El gran misterio</h4>
              <div className="who">{aw.mystery.name}</div>
              <div className="q">
                Engañó a {aw.mystery.fooled} de {aw.mystery.total}: “{aw.mystery.fact}”
              </div>
            </div>
          )}
          {aw.openBook && (
            <div className="award">
              <div className="ic">📖</div>
              <h4>Libro abierto</h4>
              <div className="who">{aw.openBook.name}</div>
              <div className="q">
                El {aw.openBook.pct}% lo adivinó: “{aw.openBook.fact}”
              </div>
            </div>
          )}
        </div>
      )}
      <div className="center" style={{ marginTop: 34 }}>
        <button className="btn ghost-light" onClick={() => act("restart")} disabled={busy}>
          Volver a la sala (conserva los datos)
        </button>
      </div>
    </div>
  );
}
