import { createCipheriv, createDecipheriv, randomBytes, createHash } from "node:crypto";
import { BridgeError } from "./errors.js";

/** Tokens are encrypted at rest. The deployment owns the key, not the database. */
export class SecretVault {
  constructor(key) {
    this.key = key ? Buffer.from(key, "base64") : null;
    if (this.key && this.key.length !== 32) {
      throw new Error("BRIDGE_ENCRYPTION_KEY must be a base64-encoded 32-byte key.");
    }
  }

  get configured() { return Boolean(this.key); }

  encrypt(value, context) {
    if (!this.key) throw new BridgeError("Account connections have not been configured on this server.", { status: 503, code: "connections_unconfigured" });
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", this.key, iv);
    cipher.setAAD(Buffer.from(context));
    const data = Buffer.concat([cipher.update(JSON.stringify(value), "utf8"), cipher.final()]);
    return ["v1", iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), data.toString("base64url")].join(".");
  }

  decrypt(value, context) {
    if (!this.key) throw new BridgeError("Account connections have not been configured on this server.", { status: 503 });
    const [version, iv, tag, data] = String(value).split(".");
    if (version !== "v1" || !iv || !tag || !data) throw new Error("Invalid encrypted credential.");
    const cipher = createDecipheriv("aes-256-gcm", this.key, Buffer.from(iv, "base64url"));
    cipher.setAAD(Buffer.from(context));
    cipher.setAuthTag(Buffer.from(tag, "base64url"));
    return JSON.parse(Buffer.concat([cipher.update(Buffer.from(data, "base64url")), cipher.final()]).toString("utf8"));
  }

  static hash(value) { return createHash("sha256").update(value).digest("hex"); }
}
