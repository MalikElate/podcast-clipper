import { randomUUID } from "node:crypto";
import { BridgeError } from "./errors.js";

export class LockService {
  constructor(store, { clock = () => Date.now() } = {}) { this.store = store; this.clock = clock; }
  async withLock(name, fn, { waitMs = 30000, leaseMs = 60000 } = {}) {
    const holder = randomUUID();
    const deadline = this.clock() + waitMs;
    while (!this.store.acquireLease(name, holder, this.clock(), leaseMs)) {
      if (this.clock() >= deadline) throw new BridgeError("This account is busy. Please try again shortly.", { status: 409, code: "account_busy" });
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    const timer = setInterval(() => this.store.acquireLease(name, holder, this.clock(), leaseMs), Math.floor(leaseMs / 3));
    timer.unref?.();
    try { return await fn(); } finally { clearInterval(timer); this.store.releaseLease(name, holder); }
  }
}
