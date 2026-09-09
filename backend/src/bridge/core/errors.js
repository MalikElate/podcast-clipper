export class BridgeError extends Error {
  constructor(message, { status = 400, code = "invalid_request", details = null } = {}) {
    super(message);
    this.name = "BridgeError";
    Object.assign(this, { status, code, details });
  }
}

export class ProviderError extends BridgeError {
  constructor(message, options = {}) {
    super(message, { status: 502, code: "provider_error", ...options });
    this.name = "ProviderError";
    this.retryable = options.retryable ?? false;
    this.retryAt = options.retryAt ?? null;
    this.uncertain = options.uncertain ?? false;
    this.reconnect = options.reconnect ?? false;
    this.restartPublishing = options.restartPublishing ?? false;
  }
}

export function invariant(condition, message, options) {
  if (!condition) throw new BridgeError(message, options);
}

export function publicError(error) {
  if (error instanceof BridgeError) {
    return { error: error.message, code: error.code, details: error.details };
  }
  return { error: "Something went wrong. Please try again.", code: "internal_error" };
}
