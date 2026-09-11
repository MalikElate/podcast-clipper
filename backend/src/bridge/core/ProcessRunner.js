import { spawn } from "node:child_process";
import { BridgeError } from "./errors.js";

export class ProcessRunner {
  static children = new Set();
  static terminateAll() { for (const child of this.children) child.kill("SIGKILL"); }
  run(command, args, { timeoutMs = 120000, maxOutput = 2 * 1024 ** 2 } = {}) {
    return new Promise((resolve, reject) => {
      const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"] });
      ProcessRunner.children.add(child);
      let output = "", timedOut = false;
      const timer = setTimeout(() => { timedOut = true; child.kill("SIGKILL"); }, timeoutMs);
      child.stdout.on("data", data => { output += data; if (output.length > maxOutput) child.kill("SIGKILL"); });
      child.stderr.resume();
      child.on("error", error => { ProcessRunner.children.delete(child); clearTimeout(timer); reject(new BridgeError(error.code === "ENOENT" ? `${command} is not installed on this server.` : "Media processing could not start.", { status: 503, code: "media_tools_unavailable" })); });
      child.on("close", code => {
        ProcessRunner.children.delete(child);
        clearTimeout(timer);
        if (code === 0 && output.length <= maxOutput) resolve(output);
        else reject(new BridgeError(timedOut ? "Media processing took too long. Try a smaller file." : "This media could not be processed. Try exporting it again.", { code: "media_processing_failed" }));
      });
    });
  }
}
