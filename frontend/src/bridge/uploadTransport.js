export function uploadWithProgress(url, { body, token, signal, onProgress = () => {}, createRequest = () => new XMLHttpRequest() }) {
  signal?.throwIfAborted();
  return new Promise((resolve, reject) => {
    const xhr = createRequest();
    const cleanup = () => signal?.removeEventListener("abort", abort);
    const abort = () => xhr.abort();
    const fail = error => { cleanup(); reject(error); };
    xhr.open("POST", url);
    xhr.responseType = "json";
    xhr.timeout = 30 * 60 * 1000;
    xhr.setRequestHeader("Authorization", `Bearer ${token}`);
    xhr.upload.onprogress = event => onProgress({ stage: "uploading", loaded: event.loaded, total: event.lengthComputable ? event.total : 0 });
    xhr.upload.onload = () => onProgress({ stage: "processing" });
    xhr.onload = () => {
      cleanup();
      resolve({ ok: xhr.status >= 200 && xhr.status < 300, status: xhr.status, data: xhr.response || {} });
    };
    xhr.onerror = () => fail(new Error("The upload connection was interrupted. Please try again."));
    xhr.ontimeout = () => fail(new Error("The upload took too long. Check your connection and try again."));
    xhr.onabort = () => fail(signal?.reason || new DOMException("Upload cancelled.", "AbortError"));
    signal?.addEventListener("abort", abort, { once: true });
    if (signal?.aborted) { fail(signal.reason); return; }
    try { xhr.send(body); } catch (error) { fail(error); }
  });
}
