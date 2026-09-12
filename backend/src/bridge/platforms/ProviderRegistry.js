import { BridgeError } from "../core/errors.js";

export class ProviderRegistry {
  constructor(providers = [], { disabled = [] } = {}) {
    this.providers = new Map();
    this.disabled = new Set(disabled);
    providers.forEach(provider => this.register(provider));
  }
  register(provider) {
    if (this.providers.has(provider.id)) throw new Error(`Duplicate platform adapter: ${provider.id}`);
    this.providers.set(provider.id, provider);
    return this;
  }
  get(id) {
    const provider = this.providers.get(id);
    if (!provider || this.disabled.has(id)) throw new BridgeError("This platform is not enabled.", { code: "platform_disabled" });
    return provider;
  }
  list() { return [...this.providers.values()].filter(provider => !this.disabled.has(provider.id)); }
  forCleanup(id) {
    // Turning off publishing must not prevent an existing user withdrawing access.
    const provider = this.providers.get(id);
    if (!provider) throw new BridgeError("This connection cannot be cleaned up yet.", { code: "platform_missing" });
    return provider;
  }
  catalog() { return this.list().map(provider => ({ ...provider.capabilities, configured: provider.configured })); }
}
