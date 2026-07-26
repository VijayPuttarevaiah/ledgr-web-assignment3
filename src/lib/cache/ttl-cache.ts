/**
 * Assignment 3 §2 — server-side optimisation 1: in-memory caching.
 *
 * A small TTL + LRU cache with request coalescing ("single flight").
 *
 * The coalescing half matters as much as the caching half here. Under the
 * moderate JMeter scenario 50 virtual users arrive at nearly the same
 * instant; with a plain cache, all 50 miss simultaneously and all 50 issue
 * the same expensive call, so the cache only starts helping from the 51st
 * request onwards — precisely the thundering herd that took the baseline
 * down. Holding the in-flight promise in the map means the first caller
 * does the work and the other 49 await its result.
 *
 * Deliberately not Redis: the whole point of this optimisation is to remove
 * a network round-trip from the hot path, and replacing an HTTP call to
 * Supabase with a TCP call to Redis would reintroduce most of the cost.
 * The trade-off is that the cache is per-process, so a multi-instance
 * deployment gets one cache per instance — acceptable for data that is
 * already only seconds-fresh, and noted in the report.
 *
 * Runtime-agnostic on purpose (no node: imports): the same module is used
 * from Route Handlers on the Node runtime and from proxy.ts on the Edge
 * runtime. Each runtime gets its own instance, which is correct — they are
 * separate isolates and cannot share memory anyway.
 */

export interface TtlCacheOptions {
  /** How long an entry stays fresh, in milliseconds. */
  ttlMs: number;
  /** Hard cap on entries; the least-recently-used entry is evicted past it. */
  maxEntries?: number;
  /** Name used by the cache-statistics endpoint and the report. */
  name: string;
}

interface Entry<T> {
  value: T;
  expiresAt: number;
}

export interface CacheStats {
  name: string;
  hits: number;
  misses: number;
  coalesced: number;
  evictions: number;
  size: number;
  hitRatio: number;
}

export class TtlCache<T> {
  private readonly entries = new Map<string, Entry<T>>();
  private readonly inFlight = new Map<string, Promise<T>>();
  private readonly ttlMs: number;
  private readonly maxEntries: number;
  readonly name: string;

  private hits = 0;
  private misses = 0;
  private coalesced = 0;
  private evictions = 0;

  constructor(options: TtlCacheOptions) {
    this.ttlMs = options.ttlMs;
    this.maxEntries = options.maxEntries ?? 1_000;
    this.name = options.name;
  }

  get(key: string): T | undefined {
    const entry = this.entries.get(key);
    if (!entry) return undefined;
    if (entry.expiresAt <= Date.now()) {
      this.entries.delete(key);
      return undefined;
    }
    // Map preserves insertion order, so deleting and re-inserting moves the
    // key to the most-recently-used end — that is what makes the eviction
    // below LRU rather than merely first-in-first-out.
    this.entries.delete(key);
    this.entries.set(key, entry);
    return entry.value;
  }

  set(key: string, value: T): void {
    this.entries.delete(key);
    this.entries.set(key, { value, expiresAt: Date.now() + this.ttlMs });
    while (this.entries.size > this.maxEntries) {
      const oldest = this.entries.keys().next();
      if (oldest.done) break;
      this.entries.delete(oldest.value);
      this.evictions += 1;
    }
  }

  delete(key: string): void {
    this.entries.delete(key);
    this.inFlight.delete(key);
  }

  /**
   * Drops every entry whose key starts with `prefix`.
   *
   * Used for invalidation where one write can affect several keys — a new
   * transaction moves the totals for every date range containing it, and
   * the caller cannot know which ranges are currently cached. Keys are
   * built as `<userId>:<...>` so the prefix scopes the sweep to one user.
   */
  deleteByPrefix(prefix: string): number {
    let removed = 0;
    for (const key of [...this.entries.keys()]) {
      if (key.startsWith(prefix)) {
        this.entries.delete(key);
        removed += 1;
      }
    }
    for (const key of [...this.inFlight.keys()]) {
      if (key.startsWith(prefix)) this.inFlight.delete(key);
    }
    return removed;
  }

  clear(): void {
    this.entries.clear();
    this.inFlight.clear();
  }

  /**
   * Returns the cached value, or runs `load` and caches it. Concurrent
   * callers for the same key share a single execution of `load`.
   */
  async getOrLoad(key: string, load: () => Promise<T>): Promise<T> {
    const cached = this.get(key);
    if (cached !== undefined) {
      this.hits += 1;
      return cached;
    }

    const pending = this.inFlight.get(key);
    if (pending) {
      this.coalesced += 1;
      return pending;
    }

    this.misses += 1;
    const promise = load()
      .then((value) => {
        this.set(key, value);
        return value;
      })
      .finally(() => {
        this.inFlight.delete(key);
      });

    this.inFlight.set(key, promise);
    return promise;
  }

  stats(): CacheStats {
    const total = this.hits + this.misses + this.coalesced;
    return {
      name: this.name,
      hits: this.hits,
      misses: this.misses,
      coalesced: this.coalesced,
      evictions: this.evictions,
      size: this.entries.size,
      hitRatio: total === 0 ? 0 : Number(((this.hits + this.coalesced) / total).toFixed(4)),
    };
  }
}

/**
 * Caches must survive Next.js loading a module more than once in the same
 * process (the RSC graph, the route-handler graph and instrumentation are
 * separate registries), or every graph would get its own empty cache and
 * the hit ratio would collapse without any visible error.
 */
const registryKey = Symbol.for("ledgr.cache.registry");
const store = globalThis as unknown as { [registryKey]?: Map<string, TtlCache<unknown>> };
const registry = (store[registryKey] ??= new Map<string, TtlCache<unknown>>());

export function getCache<T>(options: TtlCacheOptions): TtlCache<T> {
  const existing = registry.get(options.name);
  if (existing) return existing as TtlCache<T>;
  const created = new TtlCache<T>(options);
  registry.set(options.name, created as TtlCache<unknown>);
  return created;
}

export function allCacheStats(): CacheStats[] {
  return [...registry.values()].map((cache) => cache.stats());
}

/**
 * SHA-256 of the session cookie, used as the cache key.
 *
 * Keying on the raw cookie would leave a map of live access tokens in
 * process memory for anything with a heap dump to read. Hashing keeps the
 * key one-to-one with the session — a different or rotated token produces a
 * different key and therefore a real re-verification — without retaining
 * the credential itself. Web Crypto rather than node:crypto so the same
 * function works on the Edge runtime.
 */
export async function hashKey(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}
