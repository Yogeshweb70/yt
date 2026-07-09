import { randomUUID } from "node:crypto";

// Minimal in-memory Supabase-compatible client for reliability tests. Supports
// the query surface used by queue.ts / jobs.ts / logger.ts: from/select/insert/
// update/upsert/delete + eq/in/lte/gte/not/order/limit + single/maybeSingle,
// and is awaitable (thenable) for non-single terminals.

type Row = Record<string, unknown>;
type Pred = { col: string; op: string; val: unknown };

// Mirrors the NOT NULL column defaults from the queue_jobs / jobs migrations
// that the real code relies on (Postgres applies these; the fake must too).
const DB_DEFAULTS: Row = {
  status: "pending",
  attempts: 0,
  max_attempts: 3,
  progress: 0,
  depends_on: [],
};

class Builder {
  private preds: Pred[] = [];
  private orders: { col: string; asc: boolean }[] = [];
  private _limit: number | null = null;
  private op: "select" | "insert" | "update" | "upsert" | "delete" = "select";
  private payload: Row | Row[] | null = null;
  private conflict: string | null = null;

  constructor(private table: Row[], private tableName: string) {}

  select() { return this; }
  insert(v: Row | Row[]) { this.op = "insert"; this.payload = v; return this; }
  update(v: Row) { this.op = "update"; this.payload = v; return this; }
  upsert(v: Row, opts?: { onConflict?: string }) {
    this.op = "upsert"; this.payload = v; this.conflict = opts?.onConflict ?? null; return this;
  }
  delete() { this.op = "delete"; return this; }

  eq(col: string, val: unknown) { this.preds.push({ col, op: "eq", val }); return this; }
  in(col: string, val: unknown[]) { this.preds.push({ col, op: "in", val }); return this; }
  lte(col: string, val: unknown) { this.preds.push({ col, op: "lte", val }); return this; }
  gte(col: string, val: unknown) { this.preds.push({ col, op: "gte", val }); return this; }
  not(col: string, _op: string, val: unknown) { this.preds.push({ col, op: "not", val }); return this; }
  order(col: string, o?: { ascending?: boolean }) { this.orders.push({ col, asc: o?.ascending ?? true }); return this; }
  limit(n: number) { this._limit = n; return this; }

  private match(r: Row): boolean {
    return this.preds.every((p) => {
      const v = r[p.col];
      if (p.op === "eq") return v === p.val;
      if (p.op === "in") return (p.val as unknown[]).includes(v);
      if (p.op === "lte") return (v as string | number) <= (p.val as string | number);
      if (p.op === "gte") return (v as string | number) >= (p.val as string | number);
      if (p.op === "not") return v !== p.val && v != null; // used as `not is null`
      return true;
    });
  }

  private apply(): Row[] {
    if (this.op === "insert") {
      const rows = (Array.isArray(this.payload) ? this.payload : [this.payload!]).map((r) => ({
        id: r.id ?? randomUUID(),
        created_at: new Date().toISOString(),
        ...DB_DEFAULTS,
        ...r,
      }));
      this.table.push(...rows);
      return rows;
    }
    if (this.op === "upsert") {
      const v = this.payload as Row;
      const key = this.conflict;
      const existing = key ? this.table.find((r) => r[key] === v[key]) : undefined;
      if (existing) { Object.assign(existing, v); return [existing]; }
      const row = { id: v.id ?? randomUUID(), created_at: new Date().toISOString(), ...v };
      this.table.push(row);
      return [row];
    }
    let rows = this.table.filter((r) => this.match(r));
    if (this.op === "update") { rows.forEach((r) => Object.assign(r, this.payload)); return rows; }
    if (this.op === "delete") {
      rows.forEach((r) => this.table.splice(this.table.indexOf(r), 1));
      return rows;
    }
    // select
    for (const o of this.orders) {
      rows = [...rows].sort((a, b) => {
        const av = a[o.col] as number | string, bv = b[o.col] as number | string;
        const c = av < bv ? -1 : av > bv ? 1 : 0;
        return o.asc ? c : -c;
      });
    }
    if (this._limit != null) rows = rows.slice(0, this._limit);
    return rows;
  }

  async maybeSingle() { const rows = this.apply(); return { data: rows[0] ?? null, error: null }; }
  async single() {
    const rows = this.apply();
    return rows[0] ? { data: rows[0], error: null } : { data: null, error: { message: "no rows" } };
  }
  then(resolve: (v: { data: Row[]; error: null }) => unknown, reject?: (e: unknown) => unknown) {
    try { resolve({ data: this.apply(), error: null }); }
    catch (e) { reject?.(e); }
  }
}

export class FakeSupabase {
  tables: Record<string, Row[]> = {};
  from(name: string) {
    this.tables[name] ??= [];
    return new Builder(this.tables[name], name);
  }
  reset() { this.tables = {}; }
}
