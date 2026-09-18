import { Temporal } from "@js-temporal/polyfill";
import { BridgeError, invariant } from "../core/errors.js";

export class ScheduleService {
  constructor({ clock = () => Date.now() } = {}) { this.clock = clock; }

  // A time that occurs twice when clocks go back always uses the first occurrence.
  resolve({ localDateTime, timeZone } = {}) {
    invariant(typeof localDateTime === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/.test(localDateTime), "Choose a date and time.");
    invariant(typeof timeZone === "string" && timeZone.length < 100, "Choose a timezone.");
    try {
      const plain = Temporal.PlainDateTime.from(localDateTime);
      const zoned = plain.toZonedDateTime(timeZone, { disambiguation: "earlier" });
      // A nonexistent time (clocks going forward) must not be silently moved.
      invariant(zoned.toPlainDateTime().equals(plain), "This local time does not exist because the clocks change. Choose another time.", { code: "invalid_local_time" });
      return { requestedAt: Number(zoned.epochMilliseconds), timeZone, localDateTime, offset: zoned.offset };
    } catch (error) {
      if (error instanceof BridgeError) throw error;
      throw new BridgeError("This date or time is invalid. Choose another time.", { code: "invalid_local_time" });
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
