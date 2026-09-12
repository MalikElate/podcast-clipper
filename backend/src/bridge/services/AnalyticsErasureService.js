import { invariant } from "../core/errors.js";

/** Deletes legacy identified PostHog data; no new product events are collected. */
export class AnalyticsErasureService {
  constructor({ store, env, fetcher = fetch }) { Object.assign(this, { store, env, fetcher }); }
  async request(path, body) {
    const host = this.env.POSTHOG_API_HOST || "https://us.posthog.com";
    invariant(["https://us.posthog.com", "https://eu.posthog.com"].includes(host), "Invalid analytics API host.");
    const response = await this.fetcher(`${host}/api/projects/${encodeURIComponent(this.env.POSTHOG_PROJECT_ID)}/persons/${path}`, {
      method: body ? "POST" : "GET", headers: { Authorization: `Bearer ${this.env.POSTHOG_PERSONAL_API_KEY}`, "Content-Type": "application/json" },
      ...(body ? { body: JSON.stringify(body) } : {}), redirect: "error", signal: AbortSignal.timeout(30000),
    });
    invariant(response.ok, "Historical analytics deletion failed.");
    return response.json();
  }
  async deleteForOwner(uid) {
    if (this.env.BRIDGE_POSTHOG_LEGACY_DATA === "false") return true;
    invariant(this.env.POSTHOG_PERSONAL_API_KEY && this.env.POSTHOG_PROJECT_ID, "Historical analytics deletion needs operator attention.", { code: "analytics_deletion_unconfigured" });
    let state = this.store.get("processor_erasure", uid);
    if (!state) {
      const people = await this.request(`?distinct_id=${encodeURIComponent(uid)}&limit=100`);
      invariant(Array.isArray(people.results) && !people.next, "Historical analytics lookup needs operator attention.");
      const persons = people.results;
      invariant(persons.every(person => person.distinct_ids?.includes(uid) && !person.distinct_ids.some(id => id.startsWith("user_") && id !== uid)), "A merged analytics profile needs operator attention.");
      const uuids = persons.map(person => person.uuid || person.id);
      invariant(uuids.every(id => /^[a-f0-9-]{36}$/i.test(String(id))), "Invalid analytics person identifier.");
      // Persist IDs before the remote mutation so a crash cannot lose the status lookup.
      state = this.store.put("processor_erasure", { id: uid, ownerUid: uid, uuids, status: "prepared" });
    }
    if (state.status === "prepared") {
      const result = await this.request("bulk_delete/", { distinct_ids: [uid], delete_events: true, delete_recordings: true, keep_person: false });
      invariant(!result.deletion_errors?.length, "Historical analytics deletion needs operator attention.");
      state = this.store.put("processor_erasure", { ...state, status: "waiting", queued: Boolean(result.events_queued_for_deletion || result.recordings_queued_for_deletion), recordingsQueued: Boolean(result.recordings_queued_for_deletion) });
    }
    if (!state.queued) { this.store.remove("processor_erasure", uid); return true; }
    // No person UUID means the provider's queued result cannot be verified automatically.
    if (!state.uuids.length) return false;
    for (const uuid of state.uuids) {
      const result = await this.request(`deletion_status/?person_uuid=${encodeURIComponent(uuid)}&status=all&limit=100`);
      if (!Array.isArray(result.results) || result.next || !result.results.length || result.results.some(item => item.person_uuid !== uuid || item.status !== "completed" || !item.delete_verified_at)) return false;
    }
    // The documented status endpoint verifies event deletion, not recording blobs.
    // An operator must verify recordings before acknowledging this step.
    if (state.recordingsQueued) return false;
    this.store.remove("processor_erasure", uid);
    return true;
  }
}
