export function uploadWithProgress(url, { body, token, signal, onProgress = () => {}, createRequest = () => new XMLHttpRequest() }) {
  return transfer(url, { body, token, signal, onProgress, createRequest });
}

// A signed storage URL is its own authorization. Keep this separate from the
// Meadow upload transport so session tokens and cookies never reach storage.
export function uploadPartWithProgress(url, { body, signal, onProgress = () => {}, createRequest = () => new XMLHttpRequest() }) {
  return transfer(url, { body, signal, onProgress, createRequest, direct: true });
}

function transfer(url, { body, token, signal, onProgress, createRequest, direct = false }) {
  signal?.throwIfAborted();
  return new Promise((resolve, reject) => {
    const xhr = createRequest();
    const cleanup = () => signal?.removeEventListener("abort", abort);
    const abort = () => xhr.abort();
    const fail = error => { cleanup(); reject(error); };
    xhr.open(direct ? "PUT" : "POST", url);
    xhr.responseType = direct ? "text" : "json";
    xhr.timeout = 30 * 60 * 1000;
    if (direct) {
      xhr.withCredentials = false;
      xhr.setRequestHeader("Content-Type", "application/octet-stream");
    } else xhr.setRequestHeader("Authorization", `Bearer ${token}`);
    xhr.upload.onprogress = event => onProgress({ stage: "uploading", loaded: event.loaded, total: event.lengthComputable ? event.total : 0 });
    xhr.upload.onload = () => { if (!direct) onProgress({ stage: "processing" }); };
    xhr.onload = () => {
      cleanup();
      resolve({ ok: xhr.status >= 200 && xhr.status < 300, status: xhr.status, ...(direct ? { etag: xhr.getResponseHeader("ETag") } : { data: xhr.response || {} }) });
    };
    xhr.onerror = () => fail(Object.assign(new Error("The upload connection was interrupted. Please try again."), { code: "network_error" }));
    xhr.ontimeout = () => fail(Object.assign(new Error("The upload took too long. Check your connection and try again."), { code: "upload_timeout" }));
    xhr.onabort = () => fail(signal?.reason || new DOMException("Upload cancelled.", "AbortError"));
    signal?.addEventListener("abort", abort, { once: true });
    if (signal?.aborted) { fail(signal.reason); return; }
    try { xhr.send(body); } catch (error) { fail(error); }
  });
}
