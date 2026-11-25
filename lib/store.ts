import { Redis } from "@upstash/redis";

/**
 * Almacenamiento mínimo. En Vercel usa Upstash Redis (variables KV_REST_API_* o
 * UPSTASH_REDIS_REST_*). Sin esas variables usa memoria local, útil para desarrollo.
 */
export interface Store {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ttlSeconds: number): Promise<void>;
  hget(key: string, field: string): Promise<string | null>;
  hgetall(key: string): Promise<Record<string, string>>;
  hset(key: string, field: string, value: string, ttlSeconds: number): Promise<void>;
  /** Escribe solo si el campo no existe. Devuelve true si escribió. */
  hsetnx(key: string, field: string, value: string, ttlSeconds: number): Promise<boolean>;
  hdel(key: string, field: string): Promise<void>;
  del(key: string): Promise<void>;
}

class RedisStore implements Store {
  constructor(private r: Redis) {}
  async get(key: string) {
    return (await this.r.get<string>(key)) ?? null;
  }
  async set(key: string, value: string, ttl: number) {
    await this.r.set(key, value, { ex: ttl });
  }
  async hget(key: string, field: string) {
    return (await this.r.hget<string>(key, field)) ?? null;
  }
  async hgetall(key: string) {
    return ((await this.r.hgetall<Record<string, string>>(key)) ?? {}) as Record<string, string>;
  }
  async hset(key: string, field: string, value: string, ttl: number) {
    await Promise.all([this.r.hset(key, { [field]: value }), this.r.expire(key, ttl)]);
  }
  async hsetnx(key: string, field: string, value: string, ttl: number) {
    const [ok] = await Promise.all([this.r.hsetnx(key, field, value), this.r.expire(key, ttl)]);
    return ok === 1;
  }
  async hdel(key: string, field: string) {
    await this.r.hdel(key, field);
  }
  async del(key: string) {
    await this.r.del(key);
  }
}

type Entry = { v: string | Map<string, string>; exp: number };
class MemoryStore implements Store {
  private m = new Map<string, Entry>();
  private live(key: string) {
    const e = this.m.get(key);
    if (e && e.exp < Date.now()) {
      this.m.delete(key);
      return undefined;
    }
    return e;
  }
  private hash(key: string, ttl: number) {
    let e = this.live(key);
    if (!e || typeof e.v === "string") {
      e = { v: new Map(), exp: 0 };
      this.m.set(key, e);
    }
    e.exp = Date.now() + ttl * 1000;
    return e.v as Map<string, string>;
  }
  async get(key: string) {
    const e = this.live(key);
    return e && typeof e.v === "string" ? e.v : null;
  }
  async set(key: string, value: string, ttl: number) {
    this.m.set(key, { v: value, exp: Date.now() + ttl * 1000 });
  }
  async hget(key: string, field: string) {
    const e = this.live(key);
    return e && typeof e.v !== "string" ? e.v.get(field) ?? null : null;
  }
  async hgetall(key: string) {
    const e = this.live(key);
    return e && typeof e.v !== "string" ? Object.fromEntries(e.v) : {};
  }
  async hset(key: string, field: string, value: string, ttl: number) {
    this.hash(key, ttl).set(field, value);
  }
  async hsetnx(key: string, field: string, value: string, ttl: number) {
    const h = this.hash(key, ttl);
    if (h.has(field)) return false;
    h.set(field, value);
    return true;
  }
  async hdel(key: string, field: string) {
    const e = this.live(key);
    if (e && typeof e.v !== "string") e.v.delete(field);
  }
  async del(key: string) {
    this.m.delete(key);
  }
}

/** Busca las credenciales de Upstash con cualquier prefijo (KV_, STORAGE_, UPSTASH_REDIS_…). */
function creds() {
  const env = process.env;
  const pick = (suffixes: string[]) => {
    for (const sfx of suffixes) {
      const key = Object.keys(env).find((k) => k.endsWith(sfx) && !k.includes("READ_ONLY") && env[k]);
      if (key) return env[key];
    }
    return undefined;
  };
  const url = env.KV_REST_API_URL || env.UPSTASH_REDIS_REST_URL || pick(["_REST_API_URL", "_REDIS_REST_URL"]);
  const token = env.KV_REST_API_TOKEN || env.UPSTASH_REDIS_REST_TOKEN || pick(["_REST_API_TOKEN", "_REDIS_REST_TOKEN"]);
  return { url, token };
}

const g = globalThis as unknown as { __store?: Store };

export function store(): Store {
  if (g.__store) return g.__store;
  const { url, token } = creds();
  if (url && token) {
    g.__store = new RedisStore(
      new Redis({ url, token, automaticDeserialization: false, enableAutoPipelining: true })
    );
  } else {
    if (process.env.VERCEL) {
      console.warn("Sin base de datos configurada: el juego no funcionará bien entre varias personas.");
    }
    g.__store = new MemoryStore();
  }
  return g.__store;
}

export const hasDatabase = () => {
  const { url, token } = creds();
  return Boolean(url && token);
};
