export default function UploadProgress({ progress }) {
  const { stage = "authorizing", loaded = 0, total = 0, filename, fileIndex = 1, fileCount = 1 } = progress || {};
  const percent = total > 0 ? Math.min(100, Math.floor(loaded / total * 100)) : null;
  const label = stage === "processing" ? "Preparing media…" : stage === "authorizing" ? "Starting upload…" : percent === null ? "Uploading…" : `Uploading ${percent}%`;
  return <div className="bridge-upload-progress">
    <div><strong role="status">{label}</strong>{fileCount > 1 && <span>File {fileIndex} of {fileCount}</span>}</div>
    {stage === "uploading" && <progress max="100" value={percent ?? undefined} aria-label="File upload progress"/>}
    {filename && <p className="bridge-upload-filename" title={filename}>{filename}</p>}
    {stage === "processing" && <p>The file has been sent. Meadow is checking it and creating a preview.</p>}
  </div>;
}
