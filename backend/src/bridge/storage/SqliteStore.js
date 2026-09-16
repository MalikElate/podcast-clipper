import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";

const opaqueLeaseName = name => `lease:${createHash("sha256").update(String(name)).digest("hex")}`;
const isOpaqueLeaseName = name => /^lease:[a-f0-9]{64}$/.test(name);

/**
 * Durable document repository. Domain services own behavior; this class owns
 * transactions, optimistic concurrency, indexes, and worker leases. Replacing
 * storage does not change platform adapters or the HTTP/UI contracts.
 */
export class SqliteStore {
  constructor(filename = ":memory:", { durability } = {}) {
    if (filename !== ":memory:") fs.mkdirSync(path.dirname(filename), { recursive: true, mode: 0o700 });
    this.db = new Database(filename);
    this.db.pragma("journal_mode = WAL");
    this.db.pragma("secure_delete = ON");
    this.db.pragma("busy_timeout = 5000");
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, applied_at INTEGER NOT NULL);
    `);
    this.migrate();
    this.db.exec("CREATE TABLE IF NOT EXISTS rate_events (id TEXT PRIMARY KEY, rate_key TEXT NOT NULL, occurred_at INTEGER NOT NULL); CREATE INDEX IF NOT EXISTS idx_rate_events_key_time ON rate_events(rate_key,occurred_at)");
    const rateEventsMigrated = this.migrateRateEvents();
    const leaseNamesNormalized = this.normalizeLeaseNames();
    if (rateEventsMigrated || leaseNamesNormalized) this.checkpointDeletedData();
    this.db.exec("CREATE TABLE IF NOT EXISTS counters (name TEXT PRIMARY KEY, value INTEGER NOT NULL)");
    this.db.exec("CREATE INDEX IF NOT EXISTS idx_entities_rate_key ON entities(kind,json_extract(data,'$.rateKey'),status)");
    this.readOne = this.db.prepare("SELECT data, revision FROM entities WHERE kind = ? AND id = ?");
    this.upsert = this.db.prepare(`INSERT INTO entities(kind,id,owner_uid,project_id,status,due_at,created_at,data,revision)
      VALUES (@kind,@id,@ownerUid,@projectId,@status,@dueAt,@createdAt,@data,1)
      ON CONFLICT(kind,id) DO UPDATE SET owner_uid=excluded.owner_uid, project_id=excluded.project_id,
      status=excluded.status, due_at=excluded.due_at, data=excluded.data, revision=entities.revision+1`);
    this.db.pragma("optimize");
    this.durability = durability;
    this.persistedChanges = durability ? -1 : 0;
    this.snapshotSequence = 0;
    this.flushTask = null;
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

  migrateRateEvents() {
    if (this.db.prepare("SELECT 1 FROM schema_migrations WHERE version = 2").get()) return false;
    this.db.transaction(() => {
      this.db.exec("ALTER TABLE rate_events ADD COLUMN owner_uid TEXT NOT NULL DEFAULT ''; ALTER TABLE rate_events ADD COLUMN account_id TEXT NOT NULL DEFAULT ''");
      this.db.exec(`UPDATE rate_events SET
        owner_uid=COALESCE((SELECT owner_uid FROM entities WHERE kind='delivery' AND id=rate_events.id),''),
        account_id=COALESCE((SELECT json_extract(data,'$.accountId') FROM entities WHERE kind='delivery' AND id=rate_events.id),'')`);
      // A legacy event without its delivery cannot be attributed safely and no
      // longer has a queue record that needs its allowance reservation.
      this.db.exec("DELETE FROM rate_events WHERE owner_uid='' OR account_id=''; CREATE INDEX idx_rate_events_owner ON rate_events(owner_uid); CREATE INDEX idx_rate_events_account ON rate_events(account_id)");
      this.db.prepare("INSERT INTO schema_migrations VALUES (2, ?)").run(Date.now());
    })();
    return true;
  }

  normalizeLeaseNames() {
    const legacy = this.db.prepare("SELECT name,holder,expires_at FROM leases").all().filter(row => !isOpaqueLeaseName(row.name));
    if (!legacy.length) return false;
    const upsert = this.db.prepare(`INSERT INTO leases(name,holder,expires_at) VALUES (?,?,?)
      ON CONFLICT(name) DO UPDATE SET holder=excluded.holder,expires_at=excluded.expires_at
      WHERE excluded.expires_at > leases.expires_at`);
    const remove = this.db.prepare("DELETE FROM leases WHERE name=?");
    this.db.transaction(() => {
      for (const row of legacy) { upsert.run(opaqueLeaseName(row.name), row.holder, row.expires_at); remove.run(row.name); }
    })();
    return true;
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

  remove(kind, id) {
    if (kind === "delivery") this.removeRateEvent(id);
    return this.db.prepare("DELETE FROM entities WHERE kind=? AND id=?").run(kind, id).changes > 0;
  }
  removeOwner(ownerUid, { keepKinds = [] } = {}) {
    return this.transaction(() => {
      this.db.prepare("DELETE FROM rate_events WHERE owner_uid=? OR id IN (SELECT id FROM entities WHERE kind='delivery' AND owner_uid=?)").run(ownerUid, ownerUid);
      this.db.prepare("DELETE FROM one_time_states WHERE json_extract(data,'$.uid')=?").run(ownerUid);
      const exclusion = keepKinds.length ? ` AND kind NOT IN (${keepKinds.map(() => "?").join(",")})` : "";
      return this.db.prepare(`DELETE FROM entities WHERE owner_uid=?${exclusion}`).run(ownerUid, ...keepKinds).changes;
    });
  }
  pruneStates(now) { this.db.prepare("DELETE FROM one_time_states WHERE expires_at<=?").run(now); }
  removeStates(ownerUid, platforms) {
    this.db.prepare(`DELETE FROM one_time_states WHERE json_extract(data,'$.uid')=? AND json_extract(data,'$.platform') IN (${platforms.map(() => "?").join(",")})`).run(ownerUid, ...platforms);
  }
  checkpointDeletedData() { this.db.pragma("wal_checkpoint(TRUNCATE)"); }
  transaction(fn) { return this.db.transaction(fn).immediate(); }
  nextSequence(name, minimum = 1) {
    return this.db.prepare("INSERT INTO counters(name,value) VALUES (?,?) ON CONFLICT(name) DO UPDATE SET value=MAX(counters.value+1,excluded.value) RETURNING value").get(name, minimum).value;
  }

  acquireLease(name, holder, now, durationMs) {
    name = opaqueLeaseName(name);
    return this.db.prepare(`INSERT INTO leases(name,holder,expires_at) VALUES (?,?,?)
      ON CONFLICT(name) DO UPDATE SET holder=excluded.holder,expires_at=excluded.expires_at
      WHERE leases.expires_at <= ? OR leases.holder = ?`).run(name, holder, now + durationMs, now, holder).changes > 0;
  }
  releaseLease(name, holder) { this.db.prepare("DELETE FROM leases WHERE name IN (?,?) AND holder=?").run(opaqueLeaseName(name), name, holder); }
  removeLease(name) { return this.db.prepare("DELETE FROM leases WHERE name IN (?,?)").run(opaqueLeaseName(name), name).changes > 0; }
  pruneLeases(now) { return this.db.prepare("DELETE FROM leases WHERE expires_at<=?").run(now).changes; }
  recordRateEvent(id, rateKey, at, ownerUid, accountId) {
    const delivery = ownerUid && accountId ? null : this.get("delivery", id);
    const resolvedOwner = ownerUid || delivery?.ownerUid, resolvedAccount = accountId || delivery?.accountId;
    if (!resolvedOwner || !resolvedAccount) throw new Error("A rate event requires an owned delivery account.");
    this.db.prepare("INSERT OR IGNORE INTO rate_events(id,rate_key,occurred_at,owner_uid,account_id) VALUES (?,?,?,?,?)").run(id, rateKey, at, resolvedOwner, resolvedAccount);
  }
  removeRateEvent(id) { this.db.prepare("DELETE FROM rate_events WHERE id=?").run(id); }
  removeRateEventsForAccount(ownerUid, accountId) { return this.db.prepare("DELETE FROM rate_events WHERE owner_uid=? AND account_id=?").run(ownerUid, accountId).changes; }
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
  peekState(key, now = Date.now()) {
    const row = this.db.prepare("SELECT data,expires_at FROM one_time_states WHERE key=?").get(key);
    return row && row.expires_at > now ? JSON.parse(row.data) : null;
  }
  /** Each caller waits until every write preceding its barrier is committed. */
  async flush() {
    if (!this.durability) return;
    if (this.db.inTransaction) throw new Error("A durable snapshot cannot be taken inside an open transaction.");
    const target = this.db.prepare("SELECT total_changes() AS value").get().value;
    if (target <= this.persistedChanges) return;
    if (!this.flushTask) {
      this.flushTask = (async () => {
        for (;;) {
          const changes = this.db.prepare("SELECT total_changes() AS value").get().value;
          if (changes <= this.persistedChanges) return;
          const bytes = this.db.serialize();
          const sequence = ++this.snapshotSequence;
          await this.durability.persist(bytes, sequence);
          this.persistedChanges = changes;
        }
      })().finally(() => { this.flushTask = null; });
    }
    await this.flushTask;
    if (this.persistedChanges < target) await this.flush();
  }
  close() { this.db.close(); }
}
