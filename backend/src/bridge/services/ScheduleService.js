import { Temporal } from "@js-temporal/polyfill";
import { BridgeError, invariant } from "../core/errors.js";

export class ScheduleService {
  constructor({ clock = () => Date.now() } = {}) { this.clock = clock; }

  resolve({ localDateTime, timeZone, disambiguation = "reject" } = {}) {
    invariant(typeof localDateTime === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/.test(localDateTime), "Choose a date and time.");
    invariant(typeof timeZone === "string" && timeZone.length < 100, "Choose a timezone.");
    invariant(["reject", "earlier", "later"].includes(disambiguation), "Invalid daylight-saving choice.");
    try {
      const plain = Temporal.PlainDateTime.from(localDateTime);
      const zoned = plain.toZonedDateTime(timeZone, { disambiguation });
      // Even an explicit overlap choice must not silently move a nonexistent time.
      invariant(zoned.toPlainDateTime().equals(plain), "This local time does not exist because the clocks change. Choose another time.", { code: "invalid_local_time" });
      return { requestedAt: Number(zoned.epochMilliseconds), timeZone, localDateTime, offset: zoned.offset, disambiguation };
    } catch (error) {
      if (error instanceof BridgeError) throw error;
      throw new BridgeError("This time is invalid or occurs twice when the clocks change. Choose another time, or select the earlier or later occurrence.", { code: "ambiguous_local_time" });
    }
  }

  forPost(input = {}) {
    if (input.mode === "now") return { mode: "now", requestedAt: this.clock(), timeZone: input.timeZone || "UTC" };
    invariant(input.mode === "scheduled", "Choose publish now or a scheduled time.");
    const resolved = this.resolve(input);
    invariant(resolved.requestedAt > this.clock(), "Choose a publishing time in the future.");
    return { mode: "scheduled", ...resolved };
  }
}
