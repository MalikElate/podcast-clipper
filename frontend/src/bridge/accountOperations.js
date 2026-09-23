// A request owns only its key. Finishing one request cannot unlock another,
// and disposed views cannot apply late responses to a new workspace.
export function createAccountOperations() {
  const pending = new Map();
  let active = true;
  return {
    start(key) {
      if (!active || pending.has(key)) return null;
      const token = { key };
      pending.set(key, token);
      return token;
    },
    current(token) { return Boolean(active && token && pending.get(token.key) === token); },
    finish(token) {
      if (!this.current(token)) return false;
      pending.delete(token.key);
      return true;
    },
    dispose() { active = false; pending.clear(); },
  };
}
