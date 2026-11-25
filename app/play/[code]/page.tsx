"use client";
import { use, useEffect, useMemo, useState } from "react";
import Confetti from "@/components/Confetti";
import { GameState, ls, playerKeyFor, post, useCountdown, useGame } from "@/lib/client";

export default function PlayPage({ params }: { params: Promise<{ code: string }> }) {
  const code = use(params).code.toUpperCase();
  const [playerId, setPlayerId] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setPlayerId(ls.get(playerKeyFor(code)));
    setReady(true);
  }, [code]);

  const { state, forPlayer, error, refresh, now } = useGame(code, { playerId, ms: 1500 });

  // Si el anfitrión lo sacó de la sala, vuelve a pedir el nombre.
  useEffect(() => {
    if (state && playerId && forPlayer === playerId && !state.me) {
      setPlayerId(null);
    }
  }, [state, playerId, forPlayer]);

  if (!ready) return null;

  if (!state) {
    return (
      <main className="wrap">
        <Top code={code} />
        {error ? <div className="error">{error}</div> : <p className="on-muted">Cargando sala…</p>}
      </main>
    );
  }

  if (!state.me) {
    return (
      <main className="wrap">
        <Top code={code} title={state.title} />
        <JoinForm
          code={code}
          phase={state.phase}
          onJoined={(id) => {
            ls.set(playerKeyFor(code), id);
            setPlayerId(id);
          }}
        />
      </main>
    );
  }

  return (
    <main className="wrap">
      <Top code={code} title={state.title} name={state.me.name} score={state.phase === "lobby" ? undefined : state.me.score} />
      {error && <div className="banner">{error}</div>}
      {state.phase === "lobby" && <Lobby state={state} code={code} onSaved={refresh} />}
      {state.phase === "question" && <Question state={state} code={code} now={now} onVoted={refresh} />}
      {state.phase === "reveal" && <Reveal state={state} />}
      {state.phase === "final" && <Final state={state} />}
    </main>
  );
}

function Top({ code, title, name, score }: { code: string; title?: string; name?: string; score?: number }) {
  return (
    <div className="topbar">
      <div className="brand">
        <span className="dot">?</span>
        <span style={{ fontSize: 17 }}>{title ?? "Quién es quién"}</span>
      </div>
      <div className="row">
        {score !== undefined && <span className="pill sun">{score} pts</span>}
        <span className="pill" title={name}>
          {name ? name.split(" ")[0] : code}
        </span>
      </div>
    </div>
  );
}

function JoinForm({ code, phase, onJoined }: { code: string; phase: string; onJoined: (id: string) => void }) {
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const r = await post<{ playerId: string }>(`/api/rooms/${code}/join`, { name });
      onJoined(r.playerId);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="card stack" onSubmit={submit}>
      <h2>¿Cómo te llamas?</h2>
      <p>
        {phase === "lobby"
          ? "Usa el nombre con el que te conoce el equipo, para que puedan votar por ti."
          : "El juego ya empezó, pero aún puedes entrar a votar."}
      </p>
      <input
        className="input"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Nombre y apellido"
        maxLength={30}
        autoFocus
        autoComplete="name"
      />
      {error && <div className="error">{error}</div>}
      <button className="btn sun block big" disabled={busy || name.trim().length < 2}>
        {busy ? "Entrando…" : "Entrar"}
      </button>
    </form>
  );
}

const IDEAS = [
  "Una vez conocí a alguien famoso…",
  "Tengo un talento raro:",
  "De niño(a) quería ser…",
  "Lo más loco que he comido es…",
  "Nadie aquí sabe que yo…",
];

function Lobby({ state, code, onSaved }: { state: GameState; code: string; onSaved: () => void }) {
  const me = state.me!;
  const [text, setText] = useState(me.fact ?? "");
  const [editing, setEditing] = useState(!me.fact);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await post(`/api/rooms/${code}/fact`, { playerId: me.id, text });
      setEditing(false);
      onSaved();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      {editing ? (
        <form className="card stack" onSubmit={save}>
          <h2>Tu dato curioso</h2>
          <p>
            Algo sobre ti que poca gente del equipo sepa. Escríbelo sin pistas obvias como tu nombre o tu cargo, para que
            cueste adivinar.
          </p>
          <textarea
            className="textarea"
            value={text}
            onChange={(e) => setText(e.target.value)}
            maxLength={220}
            placeholder={IDEAS[me.name.length % IDEAS.length]}
          />
          <div className="row" style={{ justifyContent: "space-between" }}>
            <span className="muted" style={{ fontSize: 14 }}>
              {text.length}/220
            </span>
            {me.fact && (
              <button type="button" className="btn ghost" onClick={() => setEditing(false)}>
                Cancelar
              </button>
            )}
          </div>
          {error && <div className="error">{error}</div>}
          <button className="btn sun block big" disabled={busy || text.trim().length < 8}>
            {busy ? "Guardando…" : "Guardar mi dato"}
          </button>
        </form>
      ) : (
        <div className="card stack">
          <div className="ok">Tu dato está guardado ✓</div>
          <p style={{ fontStyle: "italic", color: "var(--ink)", fontSize: 18 }}>“{me.fact}”</p>
          <p>Nadie más lo ve hasta que empiece el juego. Puedes cambiarlo mientras tanto.</p>
          <button className="btn ghost block" onClick={() => setEditing(true)}>
            Cambiar mi dato
          </button>
        </div>
      )}
      <p className="on-muted center" style={{ marginTop: 22 }}>
        {state.players.length} {state.players.length === 1 ? "persona en la sala" : "personas en la sala"} ·{" "}
        {state.factCount} {state.factCount === 1 ? "dato listo" : "datos listos"}
        <br />
        Deja esta pantalla abierta, el juego empieza solo.
      </p>
    </>
  );
}

function Question({
  state,
  code,
  now,
  onVoted,
}: {
  state: GameState;
  code: string;
  now: () => number;
  onVoted: () => void;
}) {
  const me = state.me!;
  const left = useCountdown(state, now);
  const [q, setQ] = useState("");
  const [sel, setSel] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [voted, setVoted] = useState<string | null>(null);

  useEffect(() => {
    setSel(null);
    setQ("");
    setVoted(null);
    setError(null);
  }, [state.index]);

  const options = useMemo(() => {
    const term = q
      .trim()
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "");
    return state.players.filter(
      (p) =>
        p.id !== me.id &&
        (!term ||
          p.name
            .toLowerCase()
            .normalize("NFD")
            .replace(/[̀-ͯ]/g, "")
            .includes(term))
    );
  }, [state.players, q, me.id]);

  const myVote = me.myVote ?? voted;
  const pct = (left / state.roundSeconds) * 100;
  const nameOf = (id: string) => state.players.find((p) => p.id === id)?.name ?? "";

  async function send() {
    if (!sel) return;
    setBusy(true);
    setError(null);
    try {
      await post(`/api/rooms/${code}/vote`, { playerId: me.id, target: sel });
      setVoted(sel);
      onVoted();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <p className="on-muted" style={{ margin: "0 0 10px", fontWeight: 700 }}>
        Dato {state.index + 1} de {state.total}
      </p>
      <div className="fact-bubble">{state.currentFact}</div>
      <div className="timer-bar">
        <div style={{ width: `${pct}%` }} />
      </div>

      {me.isOwner ? (
        <div className="card center">
          <div className="result-emoji">😐</div>
          <h2>¡Es tu dato!</h2>
          <p>Pon cara de póker. Ganas 5 puntos por cada persona que no adivine.</p>
        </div>
      ) : myVote ? (
        <div className="card center">
          <div className="result-emoji">🤞</div>
          <h2>Votaste por {nameOf(myVote)}</h2>
          <p>Espera a que se revele la respuesta.</p>
        </div>
      ) : left <= 0 ? (
        <div className="card center">
          <div className="result-emoji">⏰</div>
          <h2>Se acabó el tiempo</h2>
          <p>Espera la respuesta en la pantalla.</p>
        </div>
      ) : (
        <div className="card stack">
          <div className="row" style={{ justifyContent: "space-between" }}>
            <h3>¿De quién es?</h3>
            <b>{Math.ceil(left)}s</b>
          </div>
          {state.players.length > 8 && (
            <input
              className="input"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Buscar nombre…"
              aria-label="Buscar nombre"
            />
          )}
          <div className="names">
            {options.map((p) => (
              <button
                key={p.id}
                className={`name-btn ${sel === p.id ? "sel" : ""}`}
                onClick={() => setSel(p.id)}
                type="button"
              >
                {p.name}
              </button>
            ))}
            {options.length === 0 && <p>No hay nadie con ese nombre.</p>}
          </div>
          {error && <div className="error">{error}</div>}
          <button className="btn sun block big" onClick={send} disabled={!sel || busy}>
            {sel ? `Votar por ${nameOf(sel).split(" ")[0]}` : "Elige a alguien"}
          </button>
          <p style={{ fontSize: 14, margin: 0 }}>Entre más rápido aciertes, más puntos. Solo tienes un voto.</p>
        </div>
      )}
    </>
  );
}

function Reveal({ state }: { state: GameState }) {
  const me = state.me!;
  const r = state.reveal!;
  const isOwner = r.ownerId === me.id;
  return (
    <>
      {me.guessedRight && <Confetti count={60} />}
      <div className="fact-bubble" style={{ marginBottom: 30 }}>
        {state.currentFact}
      </div>
      <div className="card center">
        <div className="result-emoji">{isOwner ? "😎" : me.guessedRight ? "🎯" : "🙈"}</div>
        <h2>
          {isOwner
            ? me.lastPoints > 0
              ? "¡Los engañaste!"
              : "Te descubrieron"
            : me.guessedRight
              ? "¡Le atinaste!"
              : `Era de ${r.ownerName}`}
        </h2>
        {me.lastPoints > 0 && <div className="score-big">+{me.lastPoints}</div>}
        <p style={{ marginTop: 8 }}>
          {r.correct.length} de {r.totalVotes} adivinaron. Vas de <b>#{me.rank}</b> con {me.score} puntos.
        </p>
      </div>
    </>
  );
}

function Final({ state }: { state: GameState }) {
  const me = state.me!;
  const top3 = me.rank > 0 && me.rank <= 3;
  return (
    <>
      {top3 && <Confetti count={100} />}
      <div className="card center">
        <div className="result-emoji">{me.rank === 1 ? "🏆" : me.rank === 2 ? "🥈" : me.rank === 3 ? "🥉" : "🎉"}</div>
        <h2>¡Se acabó!</h2>
        <div className="score-big">#{me.rank}</div>
        <p>
          Terminaste con {me.score} puntos entre {state.leaderboard.length} personas.
        </p>
      </div>
      <p className="on-muted center" style={{ marginTop: 18 }}>
        Mira la pantalla compartida para ver el podio.
      </p>
    </>
  );
}
