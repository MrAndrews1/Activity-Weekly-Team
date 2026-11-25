"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { GameState } from "./game";

export type { GameState };

export const ls = {
  get(key: string) {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  set(key: string, v: string) {
    try {
      localStorage.setItem(key, v);
    } catch {}
  },
};

export const hostKeyFor = (code: string) => `qeq-host-${code}`;
export const playerKeyFor = (code: string) => `qeq-player-${code}`;

export async function post<T = unknown>(url: string, data: unknown, hostKey?: string): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(hostKey ? { "x-host-key": hostKey } : {}) },
    body: JSON.stringify(data),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || "No se pudo completar. Intenta de nuevo.");
  return json as T;
}

/** Pide el estado cada `ms` milisegundos. Devuelve el estado y la diferencia de reloj con el servidor. */
export function useGame(code: string, opts: { playerId?: string | null; hostKey?: string | null; ms?: number }) {
  const [snap, setSnap] = useState<{ state: GameState; forPlayer: string | null | undefined } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const offset = useRef(0);
  const tick = useRef(0);
  const { playerId, hostKey, ms = 1500 } = opts;
  const current = useRef(playerId);
  current.current = playerId;

  const refresh = useCallback(async () => {
    const id = ++tick.current;
    try {
      const q = playerId ? `?playerId=${encodeURIComponent(playerId)}` : "";
      const t0 = Date.now();
      const res = await fetch(`/api/rooms/${code}${q}`, {
        cache: "no-store",
        headers: hostKey ? { "x-host-key": hostKey } : {},
      });
      const json = await res.json();
      // descarta respuestas viejas o pedidas con otro jugador
      if (id !== tick.current || current.current !== playerId) return;
      if (!res.ok) {
        setError(json.error || "No se pudo cargar la sala.");
        return;
      }
      const t1 = Date.now();
      offset.current = json.serverNow - (t0 + t1) / 2;
      setError(null);
      setSnap({ state: json, forPlayer: playerId });
    } catch {
      if (id === tick.current) setError("Sin conexión, reintentando…");
    }
  }, [code, playerId, hostKey]);

  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout>;
    const loop = async () => {
      await refresh();
      if (alive) timer = setTimeout(loop, document.hidden ? ms * 3 : ms);
    };
    loop();
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [refresh, ms]);

  const now = useCallback(() => Date.now() + offset.current, []);
  return { state: snap?.state ?? null, forPlayer: snap?.forPlayer, error, refresh, now };
}

/** Segundos que faltan de la ronda, se actualiza 4 veces por segundo. */
export function useCountdown(state: GameState | null, now: () => number) {
  const [left, setLeft] = useState(0);
  useEffect(() => {
    if (!state || state.phase !== "question") {
      setLeft(0);
      return;
    }
    const end = state.roundStartedAt + state.roundSeconds * 1000;
    const upd = () => setLeft(Math.max(0, (end - now()) / 1000));
    upd();
    const t = setInterval(upd, 250);
    return () => clearInterval(t);
  }, [state?.phase, state?.roundStartedAt, state?.roundSeconds, now]);
  return left;
}
