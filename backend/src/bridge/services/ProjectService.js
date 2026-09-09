import { randomUUID } from "node:crypto";
import { invariant } from "../core/errors.js";

export class ProjectService {
  constructor(store) { this.store = store; }

  list(ownerUid) { return this.store.list("project", { ownerUid }); }

  require(ownerUid, projectId) {
    const project = this.store.get("project", projectId);
    invariant(project && project.ownerUid === ownerUid, "Project not found.", { status: 404, code: "not_found" });
    return project;
  }

  create(ownerUid, { name, timeZone = "UTC" } = {}) {
    invariant(typeof name === "string" && name.trim().length >= 1 && name.trim().length <= 80, "Give your project a name between 1 and 80 characters.");
    this.validateTimeZone(timeZone);
    invariant(this.list(ownerUid).length < 100, "You have reached the project limit.");
    const now = Date.now();
    return this.store.put("project", { id: randomUUID(), ownerUid, name: name.trim(), timeZone, createdAt: now, updatedAt: now });
  }

  update(ownerUid, projectId, input) {
    const project = this.require(ownerUid, projectId);
    const name = input.name ?? project.name;
    const timeZone = input.timeZone ?? project.timeZone;
    invariant(typeof name === "string" && name.trim() && name.trim().length <= 80, "Enter a project name of up to 80 characters.");
    this.validateTimeZone(timeZone);
    return this.store.put("project", { ...project, name: name.trim(), timeZone, updatedAt: Date.now() });
  }

  requireRecord(ownerUid, projectId, kind, id) {
    this.require(ownerUid, projectId);
    const record = this.store.get(kind, id);
    invariant(record && record.projectId === projectId, "This item was not found in the selected project.", { status: 404, code: "not_found" });
    return record;
  }

  validateTimeZone(timeZone) {
    let valid = typeof timeZone === "string";
    try { new Intl.DateTimeFormat("en", { timeZone }).format(); } catch { valid = false; }
    invariant(valid, "Select a valid timezone.");
  }
}
