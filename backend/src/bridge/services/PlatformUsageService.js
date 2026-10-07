import { invariant } from "../core/errors.js";

const CLERK_PAGE_SIZE = 500;

/** Every Meadow sign-up from Clerk, newest first, reduced to what the usage report shows. */
export function clerkUserDirectory(clerkClient) {
  return async () => {
    const users = [];
    for (let offset = 0; ; offset += CLERK_PAGE_SIZE) {
      const page = await clerkClient.users.getUserList({ limit: CLERK_PAGE_SIZE, offset, orderBy: "-created_at" });
      users.push(...page.data.map(user => ({
        uid: user.id,
        email: user.primaryEmailAddress?.emailAddress ?? user.emailAddresses?.[0]?.emailAddress ?? null,
        name: [user.firstName, user.lastName].filter(Boolean).join(" ") || null,
        signedUpAt: user.createdAt ?? null,
        lastActiveAt: user.lastActiveAt ?? null,
      })));
      if (page.data.length < CLERK_PAGE_SIZE) return users;
    }
  };
}

/**
 * Meadow-wide totals per platform and per user, for the operators named in
 * BRIDGE_ADMIN_UIDS. Users are identified by their Clerk sign-in details;
 * social account names, captions and links never leave this service.
 */
export class PlatformUsageService {
  constructor({ store, registry, listUsers = async () => [], adminUids = "", clock = () => Date.now() }) {
    this.store = store; this.registry = registry; this.listUsers = listUsers; this.clock = clock;
    this.adminUids = new Set(String(adminUids).split(",").map(uid => uid.trim()).filter(Boolean));
  }

  async report(uid) {
    invariant(this.adminUids.has(uid), "This report is limited to Meadow administrators.", { status: 403, code: "admin_required" });
    const connected = this.store.countByOwnerAndPlatform("account", "connected");
    const published = this.store.countByOwnerAndPlatform("delivery", "published");
    const names = new Map(this.registry.catalog().map(platform => [platform.id, platform.name]));
    // Platforms switched off since keep their accounts and history.
    for (const row of [...connected, ...published]) if (!names.has(row.platform)) names.set(row.platform, row.platform);

    const owners = new Map();
    const usage = (ownerUid, platform) => {
      const platforms = owners.get(ownerUid) ?? new Map();
      owners.set(ownerUid, platforms);
      if (!platforms.has(platform)) platforms.set(platform, { platform, name: names.get(platform), connectedAccounts: 0, publishedPosts: 0 });
      return platforms.get(platform);
    };
    for (const row of connected) usage(row.ownerUid, row.platform).connectedAccounts += row.count;
    for (const row of published) usage(row.ownerUid, row.platform).publishedPosts += row.count;

    let directory = [], identitiesAvailable = true;
    try { directory = await this.listUsers(); } catch (error) {
      identitiesAvailable = false;
      console.error("Platform usage user directory:", error.code || error.name);
    }
    const people = new Map(directory.map(person => [person.uid, person]));
    for (const ownerUid of owners.keys()) if (!people.has(ownerUid)) people.set(ownerUid, { uid: ownerUid, email: null, name: null, signedUpAt: null, lastActiveAt: null });

    const sum = (entries, key) => entries.reduce((total, entry) => total + entry[key], 0);
    const busiest = (left, right) => right.publishedPosts - left.publishedPosts || right.connectedAccounts - left.connectedAccounts;
    const users = [...people.values()].map(person => {
      const platforms = [...(owners.get(person.uid)?.values() ?? [])].sort((left, right) => busiest(left, right) || left.name.localeCompare(right.name));
      return { ...person, connectedAccounts: sum(platforms, "connectedAccounts"), publishedPosts: sum(platforms, "publishedPosts"), platforms };
    }).sort((left, right) => busiest(left, right) || (right.signedUpAt ?? 0) - (left.signedUpAt ?? 0));

    const platforms = [...names].map(([platform, name]) => {
      const entries = [...owners.values()].map(platformsOfOwner => platformsOfOwner.get(platform)).filter(Boolean);
      return { platform, name, connectedAccounts: sum(entries, "connectedAccounts"), publishedPosts: sum(entries, "publishedPosts") };
    });
    return {
      generatedAt: this.clock(),
      identitiesAvailable,
      totals: { users: users.length, connectedAccounts: sum(platforms, "connectedAccounts"), publishedPosts: sum(platforms, "publishedPosts") },
      platforms,
      users,
    };
  }
}
