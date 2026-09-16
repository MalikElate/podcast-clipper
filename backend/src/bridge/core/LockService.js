import { randomUUID } from "node:crypto";
import { BridgeError } from "./errors.js";

export class LockService {
  constructor(store, { clock = () => Date.now() } = {}) {
    this.store = store;
    this.clock = clock;
    this.generations = new Map();
    this.active = new Map();
  }
  generation(name) { return this.generations.get(name) || 0; }
  cancel(name) {
    if (this.active.has(name)) this.generations.set(name, this.generation(name) + 1);
    this.store.removeLease(name);
  }
  async withLock(name, fn, { waitMs = 30000, leaseMs = 60000 } = {}) {
    const holder = randomUUID();
    const deadline = this.clock() + waitMs;
    const generation = this.generation(name);
    this.active.set(name, (this.active.get(name) || 0) + 1);
    let acquired = false, timer;
    try {
      for (;;) {
        if (this.generation(name) !== generation) throw new BridgeError("This account connection changed. Try again.", { status: 409, code: "connection_changed" });
        if (this.store.acquireLease(name, holder, this.clock(), leaseMs)) break;
        if (this.clock() >= deadline) throw new BridgeError("This account is busy. Please try again shortly.", { status: 409, code: "account_busy" });
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      acquired = true;
      if (this.generation(name) !== generation) throw new BridgeError("This account connection changed. Try again.", { status: 409, code: "connection_changed" });
      timer = setInterval(() => {
        if (this.generation(name) === generation) this.store.acquireLease(name, holder, this.clock(), leaseMs);
      }, Math.max(1, Math.floor(leaseMs / 3)));
      timer.unref?.();
      return await fn();
    } finally {
      if (timer) clearInterval(timer);
      if (acquired) this.store.releaseLease(name, holder);
      const remaining = (this.active.get(name) || 1) - 1;
      if (remaining) this.active.set(name, remaining);
      else { this.active.delete(name); this.generations.delete(name); }
    }
  }
}
