import { randomBytes, randomUUID } from "crypto";
import { store } from "./store";

export const TTL = 60 * 60 * 24 * 7; // una semana
export const MAX_FACT = 220;
export const MAX_NAME = 30;

export type Phase = "lobby" | "question" | "reveal" | "final";

export interface RoundResult {
  owner: string;
  correct: string[];
  tallies: Record<string, number>;
  totalVotes: number;
  points: Record<string, number>;
}

export interface Meta {
  code: string;
  hostKey: string;
  title: string;
  createdAt: number;
  phase: Phase;
  order: string[]; // ids de los dueños de cada dato, en el orden en que salen
  index: number;
  roundStartedAt: number;
  roundSeconds: number;
  scores: Record<string, number>;
  history: RoundResult[];
}

export interface Player {
  id: string;
  name: string;
  joinedAt: number;
}

export interface Vote {
  target: string;
  at: number;
}

const k = {
  meta: (c: string) => `qeq:${c}:meta`,
  players: (c: string) => `qeq:${c}:players`,
  facts: (c: string) => `qeq:${c}:facts`,
  votes: (c: string, i: number) => `qeq:${c}:votes:${i}`,
};

export class GameError extends Error {
  constructor(message: string, public status = 400) {
    super(message);
  }
}

export const normCode = (c: string) => c.trim().toUpperCase().replace(/[^A-Z]/g, "").slice(0, 6);
const clean = (s: unknown, max: number) =>
  String(s ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);

function shuffle<T>(a: T[]): T[] {
  const b = [...a];
  for (let i = b.length - 1; i > 0; i--) {
    const j = randomBytes(4).readUInt32BE() % (i + 1);
    [b[i], b[j]] = [b[j], b[i]];
  }
  return b;
}

async function getMeta(code: string): Promise<Meta> {
  const raw = await store().get(k.meta(code));
  if (!raw) throw new GameError("Esa sala no existe o ya expiró.", 404);
  return JSON.parse(raw) as Meta;
}
const saveMeta = (m: Meta) => store().set(k.meta(m.code), JSON.stringify(m), TTL);

async function getPlayers(code: string): Promise<Record<string, Player>> {
  const raw = await store().hgetall(k.players(code));
  const out: Record<string, Player> = {};
  for (const [id, v] of Object.entries(raw)) out[id] = JSON.parse(v);
  return out;
}

export async function createRoom(title?: string) {
  const letters = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  let code = "";
  for (let attempt = 0; attempt < 10; attempt++) {
    code = Array.from(randomBytes(4), (b) => letters[b % letters.length]).join("");
    if (!(await store().get(k.meta(code)))) break;
  }
  const meta: Meta = {
    code,
    hostKey: randomUUID(),
    title: clean(title, 60) || "¿Quién es quién?",
    createdAt: Date.now(),
    phase: "lobby",
    order: [],
    index: 0,
    roundStartedAt: 0,
    roundSeconds: 30,
    scores: {},
    history: [],
  };
  await saveMeta(meta);
  return { code, hostKey: meta.hostKey };
}

export async function join(code: string, nameIn: unknown, playerId?: unknown) {
  const meta = await getMeta(code);
  const name = clean(nameIn, MAX_NAME);
  if (name.length < 2) throw new GameError("Escribe tu nombre (mínimo 2 letras).");
  const players = await getPlayers(code);
  if (typeof playerId === "string" && players[playerId]) {
    const p = { ...players[playerId], name };
    const clash = Object.values(players).find(
      (o) => o.id !== p.id && o.name.toLowerCase() === name.toLowerCase()
    );
    if (clash) throw new GameError("Ya hay alguien con ese nombre. Agrega tu apellido.");
    await store().hset(k.players(code), p.id, JSON.stringify(p), TTL);
    return { playerId: p.id, name: p.name };
  }
  // Mismo nombre = misma persona (por si entra desde otro dispositivo).
  const same = Object.values(players).find((o) => o.name.toLowerCase() === name.toLowerCase());
  if (same) return { playerId: same.id, name: same.name };
  if (meta.phase === "final") throw new GameError("El juego ya terminó.");
  const p: Player = { id: randomUUID(), name, joinedAt: Date.now() };
  await store().hset(k.players(code), p.id, JSON.stringify(p), TTL);
  return { playerId: p.id, name: p.name };
}

export async function submitFact(code: string, playerId: unknown, textIn: unknown) {
  const meta = await getMeta(code);
  if (meta.phase !== "lobby") throw new GameError("El juego ya empezó, ya no se reciben datos.");
  const players = await getPlayers(code);
  if (typeof playerId !== "string" || !players[playerId]) throw new GameError("Primero únete a la sala.", 401);
  const text = clean(textIn, MAX_FACT);
  if (text.length < 8) throw new GameError("Cuéntanos un poquito más (mínimo 8 caracteres).");
  await store().hset(k.facts(code), playerId, text, TTL);
  return { ok: true };
}

export async function vote(code: string, playerId: unknown, target: unknown) {
  const meta = await getMeta(code);
  if (meta.phase !== "question") throw new GameError("Ahora no se puede votar.");
  if (Date.now() > meta.roundStartedAt + meta.roundSeconds * 1000 + 1500)
    throw new GameError("Se acabó el tiempo de esta ronda.");
  const players = await getPlayers(code);
  if (typeof playerId !== "string" || !players[playerId]) throw new GameError("Primero únete a la sala.", 401);
  if (typeof target !== "string" || !players[target]) throw new GameError("Esa persona no está en la sala.");
  const owner = meta.order[meta.index];
  if (playerId === owner) throw new GameError("Es tu propio dato, no puedes votar.");
  const v: Vote = { target, at: Date.now() };
  const ok = await store().hsetnx(k.votes(code, meta.index), playerId, JSON.stringify(v), TTL);
  if (!ok) throw new GameError("Ya votaste en esta ronda.");
  return { ok: true };
}

/* ---------- Acciones del anfitrión ---------- */

function score(meta: Meta, votes: Record<string, Vote>): RoundResult {
  const owner = meta.order[meta.index];
  const tallies: Record<string, number> = {};
  const points: Record<string, number> = {};
  const correct: string[] = [];
  const start = meta.roundStartedAt;
  const dur = meta.roundSeconds * 1000;
  let fooled = 0;
  for (const [voter, v] of Object.entries(votes)) {
    tallies[v.target] = (tallies[v.target] ?? 0) + 1;
    if (v.target === owner) {
      const left = Math.max(0, Math.min(1, 1 - (v.at - start) / dur));
      points[voter] = 100 + Math.round(50 * left);
      correct.push(voter);
    } else {
      fooled++;
    }
  }
  // El dueño gana un poco por cada persona que no adivinó (máximo 100), sin opacar a quienes aciertan.
  if (fooled > 0) points[owner] = (points[owner] ?? 0) + Math.min(100, fooled * 5);
  correct.sort((a, b) => votes[a].at - votes[b].at);
  return { owner, correct, tallies, totalVotes: Object.keys(votes).length, points };
}

export async function hostAction(code: string, hostKey: unknown, body: Record<string, unknown>) {
  const meta = await getMeta(code);
  if (hostKey !== meta.hostKey) throw new GameError("Solo el anfitrión puede hacer esto.", 403);
  const action = body.action;

  switch (action) {
    case "settings": {
      const s = Number(body.roundSeconds);
      if ([15, 20, 30, 45, 60].includes(s)) meta.roundSeconds = s;
      if (typeof body.title === "string") meta.title = clean(body.title, 60) || meta.title;
      break;
    }
    case "removeFact": {
      if (meta.phase !== "lobby") throw new GameError("Solo se puede antes de empezar.");
      await store().hdel(k.facts(code), String(body.playerId));
      break;
    }
    case "removePlayer": {
      if (meta.phase !== "lobby") throw new GameError("Solo se puede antes de empezar.");
      await Promise.all([
        store().hdel(k.facts(code), String(body.playerId)),
        store().hdel(k.players(code), String(body.playerId)),
      ]);
      break;
    }
    case "start": {
      if (meta.phase !== "lobby") throw new GameError("El juego ya empezó.");
      const [facts, players] = await Promise.all([store().hgetall(k.facts(code)), getPlayers(code)]);
      const owners = Object.keys(facts).filter((id) => players[id]);
      if (owners.length < 2) throw new GameError("Se necesitan al menos 2 datos para empezar.");
      let order = shuffle(owners);
      const max = Number(body.maxRounds);
      if (Number.isFinite(max) && max >= 1) order = order.slice(0, Math.floor(max));
      meta.order = order;
      meta.index = 0;
      meta.phase = "question";
      meta.roundStartedAt = Date.now();
      meta.scores = {};
      meta.history = [];
      break;
    }
    case "reveal": {
      if (meta.phase !== "question") return { ok: true }; // idempotente
      const raw = await store().hgetall(k.votes(code, meta.index));
      const votes: Record<string, Vote> = {};
      for (const [id, v] of Object.entries(raw)) votes[id] = JSON.parse(v);
      const result = score(meta, votes);
      for (const [id, p] of Object.entries(result.points)) meta.scores[id] = (meta.scores[id] ?? 0) + p;
      meta.history[meta.index] = result;
      meta.phase = "reveal";
      break;
    }
    case "next": {
      if (meta.phase !== "reveal") return { ok: true };
      if (meta.index + 1 >= meta.order.length) {
        meta.phase = "final";
      } else {
        meta.index += 1;
        meta.phase = "question";
        meta.roundStartedAt = Date.now();
      }
      break;
    }
    case "end": {
      if (meta.phase === "lobby") throw new GameError("El juego no ha empezado.");
      meta.phase = "final";
      break;
    }
    case "restart": {
      for (let i = 0; i < meta.order.length; i++) await store().del(k.votes(code, i));
      meta.phase = "lobby";
      meta.order = [];
      meta.index = 0;
      meta.scores = {};
      meta.history = [];
      break;
    }
    default:
      throw new GameError("Acción desconocida.");
  }
  await saveMeta(meta);
  return { ok: true };
}

/* ---------- Estado que ve cada cliente ---------- */

export interface LeaderRow {
  id: string;
  name: string;
  score: number;
}

export async function getState(code: string, opts: { playerId?: string | null; hostKey?: string | null }) {
  const meta = await getMeta(code);
  const isHost = opts.hostKey === meta.hostKey;
  const inRound = meta.phase === "question" || meta.phase === "reveal";
  const owner = inRound ? meta.order[meta.index] : undefined;

  const [players, facts, votesRaw] = await Promise.all([
    getPlayers(code),
    meta.phase === "lobby" || isHost || meta.phase === "final"
      ? store().hgetall(k.facts(code))
      : Promise.resolve(null),
    meta.phase === "question" ? store().hgetall(k.votes(code, meta.index)) : Promise.resolve(null),
  ]);

  const me = opts.playerId && players[opts.playerId] ? players[opts.playerId] : null;
  const list = Object.values(players).sort((a, b) => a.name.localeCompare(b.name, "es"));
  const name = (id: string) => players[id]?.name ?? "Alguien que se fue";

  let currentFact: string | null = null;
  if (owner) currentFact = facts?.[owner] ?? (await store().hget(k.facts(code), owner));

  const leaderboard: LeaderRow[] = list
    .map((p) => ({ id: p.id, name: p.name, score: meta.scores[p.id] ?? 0 }))
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name, "es"));

  const result = meta.phase === "reveal" ? meta.history[meta.index] : null;
  let myVote: string | null = null;
  if (meta.phase === "question" && me && votesRaw?.[me.id]) myVote = JSON.parse(votesRaw[me.id]).target;

  const state = {
    code: meta.code,
    title: meta.title,
    phase: meta.phase,
    serverNow: Date.now(),
    roundSeconds: meta.roundSeconds,
    roundStartedAt: meta.roundStartedAt,
    index: meta.index,
    total: meta.order.length,
    players: list.map((p) => ({ id: p.id, name: p.name, hasFact: Boolean(facts?.[p.id]) })),
    factCount: facts ? Object.keys(facts).filter((id) => players[id]).length : meta.order.length,
    currentFact,
    votesCount: votesRaw ? Object.keys(votesRaw).length : result?.totalVotes ?? 0,
    // pueden votar todos menos el dueño del dato
    eligibleVoters: owner ? list.filter((p) => p.id !== owner).length : list.length,
    me: me
      ? {
          id: me.id,
          name: me.name,
          fact: meta.phase === "lobby" ? facts?.[me.id] ?? null : null,
          isOwner: owner === me.id,
          myVote,
          score: meta.scores[me.id] ?? 0,
          rank: leaderboard.findIndex((r) => r.id === me.id) + 1,
          lastPoints: result ? result.points[me.id] ?? 0 : 0,
          guessedRight: result ? result.correct.includes(me.id) : false,
        }
      : null,
    reveal: result
      ? {
          ownerId: result.owner,
          ownerName: name(result.owner),
          correct: result.correct.map(name),
          totalVotes: result.totalVotes,
          tallies: Object.entries(result.tallies)
            .map(([id, n]) => ({ id, name: name(id), count: n }))
            .sort((a, b) => b.count - a.count),
        }
      : null,
    leaderboard: meta.phase === "reveal" || meta.phase === "final" ? leaderboard : [],
    awards: meta.phase === "final" ? awards(meta, players, facts ?? {}) : null,
    host: isHost
      ? {
          facts: Object.entries(facts ?? {})
            .filter(([id]) => players[id])
            .map(([id, text]) => ({ id, name: name(id), text })),
        }
      : null,
  };
  return state;
}

function awards(meta: Meta, players: Record<string, Player>, facts: Record<string, string>) {
  const name = (id: string) => players[id]?.name ?? "Alguien";
  const hits: Record<string, number> = {};
  let mystery: { id: string; fooled: number; total: number } | null = null;
  let obvious: { id: string; ratio: number } | null = null;
  for (const r of meta.history) {
    if (!r) continue;
    for (const id of r.correct) hits[id] = (hits[id] ?? 0) + 1;
    const fooled = r.totalVotes - r.correct.length;
    if (r.totalVotes > 0 && (!mystery || fooled > mystery.fooled))
      mystery = { id: r.owner, fooled, total: r.totalVotes };
    const ratio = r.totalVotes ? r.correct.length / r.totalVotes : 0;
    if (r.totalVotes > 0 && (!obvious || ratio > obvious.ratio)) obvious = { id: r.owner, ratio };
  }
  const detective = Object.entries(hits).sort((a, b) => b[1] - a[1])[0];
  return {
    detective: detective ? { name: name(detective[0]), hits: detective[1], rounds: meta.history.length } : null,
    mystery: mystery && mystery.fooled > 0
      ? { name: name(mystery.id), fooled: mystery.fooled, total: mystery.total, fact: facts[mystery.id] ?? "" }
      : null,
    openBook: obvious && obvious.ratio >= 0.5
      ? { name: name(obvious.id), pct: Math.round(obvious.ratio * 100), fact: facts[obvious.id] ?? "" }
      : null,
  };
}

export type GameState = Awaited<ReturnType<typeof getState>>;
