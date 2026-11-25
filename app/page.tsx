"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { hostKeyFor, ls, post } from "@/lib/client";

export default function Home() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function create() {
    setBusy(true);
    setError(null);
    try {
      const r = await post<{ code: string; hostKey: string }>("/api/rooms", { title });
      ls.set(hostKeyFor(r.code), r.hostKey);
      router.push(`/host/${r.code}`);
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }

  function goJoin(e: React.FormEvent) {
    e.preventDefault();
    const c = code.trim().toUpperCase();
    if (c.length >= 4) router.push(`/play/${c}`);
  }

  return (
    <main className="wrap">
      <div className="brand">
        <span className="dot">?</span> Quién es quién
      </div>
      <h1 className="hero-title">
        ¿De quién es <span>este dato?</span>
      </h1>
      <p className="lead">
        Cada persona manda un dato curioso suyo. En vivo, todos votan desde el celular de quién creen que es. Funciona
        igual en la sala y por videollamada.
      </p>

      <form className="card stack" onSubmit={goJoin}>
        <h2>Unirme a un juego</h2>
        <label className="label" htmlFor="code">
          Código de la sala
        </label>
        <input
          id="code"
          className="input code-input"
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/[^a-zA-Z]/g, "").slice(0, 6))}
          placeholder="ABCD"
          autoComplete="off"
          autoCapitalize="characters"
        />
        <button className="btn sun block big" disabled={code.length < 4}>
          Entrar
        </button>
      </form>

      <div className="card stack">
        <h2>Soy quien dirige el juego</h2>
        <p>Crea una sala y comparte tu pantalla. Los demás entran con el código QR.</p>
        <label className="label" htmlFor="title">
          Nombre del juego (opcional)
        </label>
        <input
          id="title"
          className="input"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Weekly del equipo"
          maxLength={60}
        />
        {error && <div className="error">{error}</div>}
        <button className="btn block" onClick={create} disabled={busy} type="button">
          {busy ? "Creando…" : "Crear sala"}
        </button>
      </div>
    </main>
  );
}
