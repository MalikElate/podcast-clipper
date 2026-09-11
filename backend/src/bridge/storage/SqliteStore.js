import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";

/**
 * Durable document repository. Domain services own behavior; this class owns
 * transactions, optimistic concurrency, indexes, and worker leases. Replacing
 * storage does not change platform adapters or the HTTP/UI contracts.
 */
export class SqliteStore {
  constructor(filename = ":memory:") {
    if (filename !== ":memory:") fs.mkdirSync(path.dirname(filename), { recursive: true, mode: 0o700 });
    this.db = new Database(filename);
    this.db.pragma("journal_mode = WAL");
    this.db.pragma("busy_timeout = 5000");
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, applied_at INTEGER NOT NULL);
    `);
    this.migrate();
    this.db.exec("CREATE TABLE IF NOT EXISTS rate_events (id TEXT PRIMARY KEY, rate_key TEXT NOT NULL, occurred_at INTEGER NOT NULL); CREATE INDEX IF NOT EXISTS idx_rate_events_key_time ON rate_events(rate_key,occurred_at)");
    this.db.exec("CREATE TABLE IF NOT EXISTS counters (name TEXT PRIMARY KEY, value INTEGER NOT NULL)");
    this.db.exec("CREATE INDEX IF NOT EXISTS idx_entities_rate_key ON entities(kind,json_extract(data,'$.rateKey'),status)");
    this.readOne = this.db.prepare("SELECT data, revision FROM entities WHERE kind = ? AND id = ?");
    this.upsert = this.db.prepare(`INSERT INTO entities(kind,id,owner_uid,project_id,status,due_at,created_at,data,revision)
      VALUES (@kind,@id,@ownerUid,@projectId,@status,@dueAt,@createdAt,@data,1)
      ON CONFLICT(kind,id) DO UPDATE SET owner_uid=excluded.owner_uid, project_id=excluded.project_id,
      status=excluded.status, due_at=excluded.due_at, data=excluded.data, revision=entities.revision+1`);
    this.db.pragma("optimize");
  }

  migrate() {
    if (this.db.prepare("SELECT 1 FROM schema_migrations WHERE version = 1").get()) return;
    this.db.transaction(() => {
      this.db.exec(`
        CREATE TABLE entities (
          kind TEXT NOT NULL, id TEXT NOT NULL, owner_uid TEXT NOT NULL DEFAULT '',
          project_id TEXT NOT NULL DEFAULT '', status TEXT NOT NULL DEFAULT '',
          due_at INTEGER, created_at INTEGER NOT NULL, data TEXT NOT NULL CHECK(json_valid(data)),
          revision INTEGER NOT NULL DEFAULT 1, PRIMARY KEY(kind,id)
        );
        CREATE INDEX idx_entities_project_kind ON entities(project_id,kind,created_at);
        CREATE INDEX idx_entities_owner_kind ON entities(owner_uid,kind,created_at);
        CREATE INDEX idx_entities_delivery_due ON entities(status,due_at) WHERE kind='delivery';
        CREATE TABLE leases (name TEXT PRIMARY KEY, holder TEXT NOT NULL, expires_at INTEGER NOT NULL);
        CREATE TABLE one_time_states (key TEXT PRIMARY KEY, data TEXT NOT NULL, expires_at INTEGER NOT NULL);
      `);
      this.db.prepare("INSERT INTO schema_migrations VALUES (1, ?)").run(Date.now());
    })();
  }

  get(kind, id) {
    const row = this.readOne.get(kind, id);
    return row ? { ...JSON.parse(row.data), revision: row.revision } : null;
  }

  list(kind, { projectId, ownerUid, status, statuses, rateKey, dueBefore, orderByDue = false, limit = 10000 } = {}) {
    let sql = "SELECT data, revision FROM entities WHERE kind = ?";
    const args = [kind];
    for (const [column, value] of [["project_id", projectId], ["owner_uid", ownerUid], ["status", status]]) {
      if (value !== undefined) { sql += ` AND ${column} = ?`; args.push(value); }
    }
    if (statuses?.length) { sql += ` AND status IN (${statuses.map(() => "?").join(",")})`; args.push(...statuses); }
    if (rateKey !== undefined) { sql += " AND json_extract(data,'$.rateKey') = ?"; args.push(rateKey); }
    if (dueBefore !== undefined) { sql += " AND due_at <= ?"; args.push(dueBefore); }
    sql += orderByDue ? " ORDER BY due_at ASC, json_extract(data,'$.order') ASC" : " ORDER BY created_at DESC";
    if (limit !== null) { sql += " LIMIT ?"; args.push(Math.min(Math.max(Number(limit) || 10000, 1), 10000)); }
    return this.db.prepare(sql).all(...args).map(row => ({ ...JSON.parse(row.data), revision: row.revision }));
  }

  put(kind, record) {
    const { revision: _, ...data } = record;
    this.upsert.run({ kind, id: data.id, ownerUid: data.ownerUid ?? "", projectId: data.projectId ?? "",
      status: data.status ?? "", dueAt: data.dueAt ?? null, createdAt: data.createdAt ?? Date.now(), data: JSON.stringify(data) });
    return this.get(kind, record.id);
  }

  remove(kind, id) { return this.db.prepare("DELETE FROM entities WHERE kind=? AND id=?").run(kind, id).changes > 0; }
  transaction(fn) { return this.db.transaction(fn).immediate(); }
  nextSequence(name, minimum = 1) {
    return this.db.prepare("INSERT INTO counters(name,value) VALUES (?,?) ON CONFLICT(name) DO UPDATE SET value=MAX(counters.value+1,excluded.value) RETURNING value").get(name, minimum).value;
  }

  acquireLease(name, holder, now, durationMs) {
    return this.db.prepare(`INSERT INTO leases(name,holder,expires_at) VALUES (?,?,?)
      ON CONFLICT(name) DO UPDATE SET holder=excluded.holder,expires_at=excluded.expires_at
      WHERE leases.expires_at <= ? OR leases.holder = ?`).run(name, holder, now + durationMs, now, holder).changes > 0;
  }
  releaseLease(name, holder) { this.db.prepare("DELETE FROM leases WHERE name=? AND holder=?").run(name, holder); }
  recordRateEvent(id, rateKey, at) { this.db.prepare("INSERT OR IGNORE INTO rate_events VALUES (?,?,?)").run(id, rateKey, at); }
  removeRateEvent(id) { this.db.prepare("DELETE FROM rate_events WHERE id=?").run(id); }
  rateEvents(rateKey, after) { return this.db.prepare("SELECT occurred_at FROM rate_events WHERE rate_key=? AND occurred_at > ? ORDER BY occurred_at").all(rateKey, after).map(row => row.occurred_at); }

  saveState(key, data, expiresAt) {
    this.db.prepare("DELETE FROM one_time_states WHERE expires_at < ?").run(Date.now());
    this.db.prepare("INSERT INTO one_time_states VALUES (?,?,?) ON CONFLICT(key) DO UPDATE SET data=excluded.data,expires_at=excluded.expires_at")
      .run(key, JSON.stringify(data), expiresAt);
  }
  consumeState(key, now = Date.now()) {
    return this.transaction(() => {
      const row = this.db.prepare("SELECT * FROM one_time_states WHERE key=?").get(key);
      this.db.prepare("DELETE FROM one_time_states WHERE key=?").run(key);
      return row && row.expires_at > now ? JSON.parse(row.data) : null;
    });
  }
  close() { this.db.close(); }
}
