import { useEffect, useRef, useState } from "react";
import UrlInput from "./components/UrlInput.jsx";
import Options from "./components/Options.jsx";
import Loading from "./components/Loading.jsx";
import Results from "./components/Results.jsx";
import Landing from "./components/Landing.jsx";
import Auth from "./components/Auth.jsx";
import Sidebar from "./components/Sidebar.jsx";
import { useAuth } from "./AuthContext.jsx";
import { createJob, getJob, listJobs } from "./api.js";

// signedOutView: "landing" | "auth"
// mainStep: "url" | "options" | "loading" | "results" | "error"
export default function App() {
  const { user } = useAuth();
  const authLoading = user === undefined;

  const [signedOutView, setSignedOutView] = useState("landing");
  const [mainStep, setMainStep] = useState("url");
  const [youtubeUrl, setYoutubeUrl] = useState("");
  const [job, setJob] = useState(null);
  const [activeJobId, setActiveJobId] = useState(null);
  const [jobsList, setJobsList] = useState([]);
  const [error, setError] = useState(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const pollRef = useRef(null);

  useEffect(() => {
    return () => clearInterval(pollRef.current);
  }, []);

  // Reset all app-local state on sign-out (user === null, as opposed to
  // undefined which just means auth is still loading).
  useEffect(() => {
    if (user === null) {
      clearInterval(pollRef.current);
      setSignedOutView("landing");
      setMainStep("url");
      setYoutubeUrl("");
      setJob(null);
      setActiveJobId(null);
      setJobsList([]);
      setError(null);
    }
  }, [user]);

  useEffect(() => {
    if (user) refreshJobsList();
  }, [user]);

  async function refreshJobsList() {
    try {
      setJobsList(await listJobs());
    } catch {
      // Non-fatal — history just won't show for now.
    }
  }

  function pollJob(id) {
    clearInterval(pollRef.current);
    pollRef.current = setInterval(async () => {
      try {
        const data = await getJob(id);
        setJob(data);
        if (data.status === "done") {
          clearInterval(pollRef.current);
          setMainStep("results");
          refreshJobsList();
        } else if (data.status === "error") {
          clearInterval(pollRef.current);
          setError(data.error);
          setMainStep("error");
          refreshJobsList();
        }
      } catch (e) {
        clearInterval(pollRef.current);
        setError(e.message);
        setMainStep("error");
      }
    }, 2000);
  }

  function handleNewClip() {
    clearInterval(pollRef.current);
    setActiveJobId(null);
    setJob(null);
    setYoutubeUrl("");
    setError(null);
    setMainStep("url");
    setSidebarOpen(false);
  }

  function handleUrlNext(url) {
    setYoutubeUrl(url);
    setMainStep("options");
  }

  async function handleSubmitOptions(options) {
    setError(null);
    setMainStep("loading");
    try {
      const jobId = await createJob({ youtubeUrl, ...options });
      setActiveJobId(jobId);
      refreshJobsList();
      pollJob(jobId);
    } catch (e) {
      setError(e.message);
      setMainStep("url");
    }
  }

  async function handleSelectHistoryJob(id) {
    setSidebarOpen(false);
    setActiveJobId(id);
    setError(null);
    clearInterval(pollRef.current);
    setMainStep("loading");
    try {
      const data = await getJob(id);
      setJob(data);
      if (data.status === "done") {
        setMainStep("results");
      } else if (data.status === "error") {
        setError(data.error);
        setMainStep("error");
      } else {
        pollJob(id);
      }
    } catch (e) {
      setError(e.message);
      setMainStep("error");
    }
  }

  return (
    <div className="app">
      <div className="app-glow app-glow-a" />
      <div className="app-glow app-glow-b" />

      {authLoading && (
        <div className="centered-shell">
          <span className="stage-text">Loading...</span>
        </div>
      )}

      {!authLoading && !user && (
        <div className="centered-shell">
          {signedOutView === "landing" ? (
            <Landing onGetStarted={() => setSignedOutView("auth")} />
          ) : (
            <Auth onBack={() => setSignedOutView("landing")} />
          )}
        </div>
      )}

      {!authLoading && user && (
        <div className="app-shell">
          <Sidebar
            jobs={jobsList}
            activeJobId={activeJobId}
            onSelectJob={handleSelectHistoryJob}
            onNewClip={handleNewClip}
            open={sidebarOpen}
            onClose={() => setSidebarOpen(false)}
          />

          <main className="main-content">
            <div className="main-topbar">
              <button className="menu-toggle" onClick={() => setSidebarOpen(true)} aria-label="Open menu">
                ☰
              </button>
            </div>

            <div className="main-inner">
              {mainStep === "url" && (
                <div style={{ width: "100%", maxWidth: 480 }}>
                  <UrlInput onNext={handleUrlNext} />
                  {error && (
                    <div className="error-box" style={{ maxWidth: 480, marginTop: 16 }}>
                      {error}
                    </div>
                  )}
                </div>
              )}
              {mainStep === "options" && (
                <Options onBack={() => setMainStep("url")} onSubmit={handleSubmitOptions} />
              )}
              {mainStep === "loading" && <Loading stage={job?.stage} />}
              {mainStep === "results" && job && <Results job={job} onRestart={handleNewClip} />}
              {mainStep === "error" && (
                <div className="card error-view">
                  <h1>Something went wrong</h1>
                  <div className="error-box">{error}</div>
                  <button className="btn-primary" onClick={handleNewClip}>
                    Start a new clip
                  </button>
                </div>
              )}
            </div>
          </main>
        </div>
      )}
    </div>
  );
}