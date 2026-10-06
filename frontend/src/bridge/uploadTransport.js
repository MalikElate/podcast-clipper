export function uploadWithProgress(url, { body, token, method = "POST", headers = {}, signal, onProgress = () => {}, createRequest = () => new XMLHttpRequest(), stallTimeoutMs = 120000 }) {
  signal?.throwIfAborted();
  return new Promise((resolve, reject) => {
    const xhr = createRequest();
    let settled = false, sent = false, loaded = 0, stallTimer;
    const cleanup = () => { clearTimeout(stallTimer); signal?.removeEventListener("abort", abort); };
    const abort = () => xhr.abort();
    const fail = error => { if (settled) return; settled = true; cleanup(); reject(error); };
    const watchProgress = () => {
      clearTimeout(stallTimer);
      stallTimer = setTimeout(() => {
        fail(Object.assign(new Error(loaded > 0 ? "The upload stopped making progress. Check your connection and select the file again." : "The upload has not started. Check your connection and select the file again. If the file is stored in the cloud, download it to your phone first."), { code: "upload_stalled" }));
        xhr.abort();
      }, stallTimeoutMs);
    };
    const processing = () => { if (settled || sent) return; sent = true; clearTimeout(stallTimer); onProgress({ stage: "processing" }); };
    // Some browsers need upload listeners installed before open() to report progress.
    xhr.upload.onprogress = event => {
      if (settled || sent) return;
      if (event.loaded > loaded) { loaded = event.loaded; watchProgress(); }
      onProgress({ stage: "uploading", loaded: event.loaded, total: event.lengthComputable ? event.total : 0 });
      if (event.lengthComputable && event.total > 0 && event.loaded >= event.total) processing();
    };
    xhr.upload.onload = processing;
    xhr.onreadystatechange = () => { if (xhr.readyState >= 2) processing(); };
    xhr.onload = () => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve({ ok: xhr.status >= 200 && xhr.status < 300, status: xhr.status, data: xhr.response || {} });
    };
    xhr.onerror = () => fail(new Error("The upload connection was interrupted. Please try again."));
    xhr.ontimeout = () => fail(new Error("The upload took too long. Check your connection and try again."));
    xhr.onabort = () => fail(signal?.reason || new DOMException("Upload cancelled.", "AbortError"));
    try {
      xhr.open(method, url);
      xhr.responseType = "json";
      xhr.timeout = (method === "PUT" ? 120 : 30) * 60 * 1000;
      if (token) xhr.setRequestHeader("Authorization", `Bearer ${token}`);
      for (const [name, value] of Object.entries(headers)) xhr.setRequestHeader(name, value);
      signal?.addEventListener("abort", abort, { once: true });
      if (signal?.aborted) { fail(signal.reason); return; }
      watchProgress();
      xhr.send(body);
    } catch (error) { fail(error); }
  });
}
