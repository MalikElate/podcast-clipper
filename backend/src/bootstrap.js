import http from "node:http";

try {
  await import("./server.js");
} catch (error) {
  console.error("Meadow backend startup failed:", error?.stack || error);

  const port = Number(process.env.PORT || 8787);
  const host = process.env.HOST || "0.0.0.0";
  const fallback = http.createServer((request, response) => {
    response.writeHead(503, {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    });
    response.end(JSON.stringify({ status: "error", app: "Meadow", code: "startup_failed" }));
  });

  fallback.listen(port, host, () => {
    console.error(`Meadow startup fallback listening on http://${host}:${port}`);
  });
}
