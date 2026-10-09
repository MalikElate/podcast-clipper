export const PUBLISHING_WAKE_CALLBACK = "wakePublishing";
export const PUBLISHING_WAKE_RETRY_MS = 60000;
const MAX_RETRY_MS = 5 * 60000;
const schedulableModes = new Set(["ready", "restoring"]);

export function validWakeAt(value) {
  return value === null || Number.isSafeInteger(value) && value > 0 && value <= 8640000000000000;
}

export function parseNextWakeHeader(value) {
  if (value === null) return undefined;
  if (value === "none") return null;
  if (!/^[1-9]\d*$/.test(value) || !validWakeAt(Number(value))) throw new Error("durable_wake_invalid");
  return Number(value);
}

const sameMetadata = (left, right) => ["initialized", "mode", "generation", "sequence", "nextWakeAt"].every(key => left?.[key] === right?.[key]);
const hasWake = status => status?.initialized && schedulableModes.has(status.mode) && status.nextWakeAt !== null && status.nextWakeAt !== undefined && validWakeAt(status.nextWakeAt);
const payloadFor = (status, retryCount = 0) => ({ generation: status.generation, sequence: status.sequence, nextWakeAt: status.nextWakeAt, retryCount });

export function currentPublishingWake(status, payload) {
  return Boolean(hasWake(status) && payload && ["generation", "sequence", "nextWakeAt"].every(key => status[key] === payload[key]));
}

export function publishingWakePlan(status, scheduled, now, { afterWake = false, failed = false, retryCount = 0 } = {}) {
  if (!hasWake(status)) return { action: "clear" };
  const priorCount = Number.isSafeInteger(retryCount) && retryCount >= 0 ? retryCount : 0;
  const count = failed ? Math.min(4, priorCount + 1) : 0;
  const retryDelay = failed ? Math.min(MAX_RETRY_MS, PUBLISHING_WAKE_RETRY_MS * 2 ** (count - 1)) : PUBLISHING_WAKE_RETRY_MS;
  // Containers stores scheduled dates in whole seconds. Round up so a callback
  // never starts a video before its committed deadline.
  let wakeAt = Math.ceil(Math.max(status.nextWakeAt, now + (afterWake && status.nextWakeAt <= now ? retryDelay : 1000)) / 1000) * 1000;
  const previous = scheduled?.payload;
  if (!afterWake && previous?.generation === status.generation && previous.nextWakeAt === status.nextWakeAt && scheduled.time * 1000 > now) {
    // An unrelated snapshot should update the sequence guard without shortening
    // an already armed retry for the same due work.
    wakeAt = Math.max(wakeAt, scheduled.time * 1000);
  }
  const payload = payloadFor(status, afterWake ? count : previous?.nextWakeAt === status.nextWakeAt ? previous.retryCount || 0 : 0);
  if (!afterWake && currentPublishingWake(status, previous) && scheduled.time * 1000 === wakeAt) return { action: "keep", wakeAt, payload };
  return { action: "schedule", wakeAt, payload };
}

/** Injected operations keep this scheduler testable without a live container.
 * The schedule lock never contains health/startup: startup calls snapshot/ready
 * back into this same object and must be able to reconcile its committed state.
 */
export function createPublishingWake({ readStatus, listSchedules, deleteSchedules, schedule, health, stopFailedRestore = async () => {}, clock = () => Date.now() }) {
  let tail = Promise.resolve();
  const serialize = operation => {
    const result = tail.then(operation);
    tail = result.catch(() => {});
    return result;
  };
  async function reconcile(options = {}) {
    return serialize(async () => {
      for (;;) {
        const status = await readStatus();
        const existing = (await listSchedules(PUBLISHING_WAKE_CALLBACK))[0];
        // The list lookup is an await point; a Stop or newer snapshot can commit
        // while it runs. Only the newest metadata may replace the alarm.
        if (!sameMetadata(status, await readStatus())) continue;
        const plan = publishingWakePlan(status, existing, clock(), options);
        if (plan.action === "keep") return plan;
        await deleteSchedules(PUBLISHING_WAKE_CALLBACK);
        if (plan.action === "schedule") await schedule(new Date(plan.wakeAt), PUBLISHING_WAKE_CALLBACK, plan.payload);
        // A new snapshot arriving during schedule() gets reconciled before this
        // call can acknowledge that publishing is safely armed.
        if (sameMetadata(status, await readStatus())) return plan;
      }
    });
  }
  async function wake(payload) {
    const status = await readStatus();
    if (!currentPublishingWake(status, payload)) {
      // An ordinary request may claim a replacement generation, then fail
      // before snapshot/ready. Preserve the committed deadline with a fresh
      // guard; the stale callback itself must never start the container.
      await reconcile();
      return { woke: false, stale: true };
    }
    if (status.nextWakeAt > clock()) {
      await reconcile({ afterWake: true });
      return { woke: false, early: true };
    }
    // Recheck after the awaited read before starting the container. Stopped or
    // superseded work must not be revived by a previously selected alarm.
    if (!currentPublishingWake(await readStatus(), payload)) { await reconcile(); return { woke: false, stale: true }; }
    let failed = false;
    let failedRestore = false;
    try {
      const response = await health(); failed = !response.ok;
      if (response.status === 503) failedRestore = (await response.clone().json().catch(() => ({}))).code === "startup_failed";
    }
    catch { failed = true; }
    const plan = await reconcile({ afterWake: true, failed, retryCount: payload.retryCount });
    if (failedRestore) {
      const current = await readStatus();
      // Arm first: a crash or failed stop must not remove the sole retry. The
      // fallback bootstrap server cannot rerun restoration until it restarts.
      if (schedulableModes.has(current.mode) && current.nextWakeAt <= clock() && currentPublishingWake(current, plan.payload)) await stopFailedRestore();
    }
    return { woke: true, failed };
  }
  return { reconcile, wake };
}
