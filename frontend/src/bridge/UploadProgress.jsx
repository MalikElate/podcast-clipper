export default function UploadProgress({ progress, onCancel }) {
  const { stage = "authorizing", loaded = 0, total = 0, filename, error, fileIndex = 1, fileCount = 1 } = progress || {};
  const stopped = stage === "failed" || stage === "cancelled";
  const percent = total > 0 ? Math.min(100, Math.floor(loaded / total * 100)) : null;
  const label = stage === "cancelled" ? "Upload cancelled" : stage === "failed" ? "Upload stopped" : stage === "processing" ? "Preparing media…" : stage === "authorizing" ? "Starting upload…" : loaded === 0 ? "Starting transfer…" : percent === null ? "Uploading…" : `Uploading ${percent}%`;
  return <div className={`bridge-upload-progress${stopped ? " is-error" : ""}`}>
    <div><strong role="status">{label}</strong>{fileCount > 1 && !stopped && <span>File {fileIndex} of {fileCount}</span>}{onCancel && !stopped && stage !== "processing" && <button type="button" className="bridge-button secondary small" onClick={onCancel}>Cancel upload</button>}</div>
    {stage === "uploading" && <progress max="100" value={loaded > 0 ? percent ?? undefined : undefined} aria-label="File upload progress"/>}
    {filename && <p className="bridge-upload-filename" title={filename}>{filename}</p>}
    {stage === "processing" && <p>The file has been sent. Meadow is checking it and creating a preview.</p>}
    {stopped && error && <p role="alert">{error}</p>}
  </div>;
}
