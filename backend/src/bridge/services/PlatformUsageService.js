import { invariant } from "../core/errors.js";

/**
 * Meadow-wide totals per platform, across every user, for the operators named
 * in BRIDGE_ADMIN_UIDS. Only counts leave this service: no account names,
 * owners, captions or links.
 */
export class PlatformUsageService {
  constructor({ store, registry, adminUids = "", clock = () => Date.now() }) {
    this.store = store; this.registry = registry; this.clock = clock;
    this.adminUids = new Set(String(adminUids).split(",").map(uid => uid.trim()).filter(Boolean));
  }

  report(uid) {
    invariant(this.adminUids.has(uid), "This report is limited to Meadow administrators.", { status: 403, code: "admin_required" });
    const connected = this.store.countByPlatform("account", "connected");
    const published = this.store.countByPlatform("delivery", "published");
    const names = new Map(this.registry.catalog().map(platform => [platform.id, platform.name]));
    // Platforms switched off since keep their accounts and history.
    for (const id of [...connected.keys(), ...published.keys()]) if (!names.has(id)) names.set(id, id);
    const platforms = [...names].map(([platform, name]) => ({ platform, name, connectedAccounts: connected.get(platform) || 0, publishedPosts: published.get(platform) || 0 }));
    const sum = key => platforms.reduce((total, platform) => total + platform[key], 0);
    return { generatedAt: this.clock(), totals: { connectedAccounts: sum("connectedAccounts"), publishedPosts: sum("publishedPosts") }, platforms };
  }
}
