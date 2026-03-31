import { useState, useEffect, useCallback, useRef } from "react";

const FILES_DATA = [
  { name: "vacation_photo.jpg", beforeTags: 23, afterTags: 0, status: "success", delay: 1500 },
  { name: "selfie_park.heic", beforeTags: 45, afterTags: 0, status: "success", delay: 2000 },
  { name: "portrait.png", beforeTags: 8, afterTags: 0, status: "success", delay: 2500 },
  { name: "corrupt_file.pdf", beforeTags: null, afterTags: "Can't read file", status: "error", delay: 3000 },
  { name: "scan_receipt.pdf", beforeTags: 12, afterTags: 0, status: "success", delay: 3500 },
  { name: "IMG_2847.mov", beforeTags: 67, afterTags: 0, status: "success", delay: 4000 },
];

const light = {
  bg: "#F5F6F8", surface: "#FFFFFF", border: "#DADEE4", body: "#3B4351",
  heading: "#1E2028", muted: "#9BA3B0", secondary: "#66758C", chrome: "#FAFAFA",
  barBg: "#FFFFFF", burgundy: "#521737", gold: "#F8D057", orange: "#E97043",
  success: "#2D8659", successBg: "#E8F5EE", error: "#C44536", errorBg: "#FCEAE8",
  toggleOff: "#DADEE4",
};

const dark = {
  bg: "#141416", surface: "#1C1C1F", border: "#48484D", body: "#C5C5CB",
  heading: "#EEEEF0", muted: "#818188", secondary: "#66758C", chrome: "#0E0E10",
  barBg: "#1C1C1F", burgundy: "#C4467A", gold: "#F8D057", orange: "#E97043",
  success: "#2D8659", successBg: "#1A3D2B", error: "#C44536", errorBg: "#3D1A16",
  toggleOff: "#48484D",
};

function Toggle({ label, on, onChange, theme }) {
  return (
    <button
      onClick={onChange}
      style={{
        display: "flex", alignItems: "center", gap: 4,
        background: "none", border: "none", cursor: "pointer", padding: "2px 0",
      }}
    >
      <span
        style={{
          width: 32, height: 18, borderRadius: 9, position: "relative",
          background: on ? theme.burgundy : theme.toggleOff,
          transition: "background 100ms ease",
          flexShrink: 0,
        }}
      >
        <span
          style={{
            position: "absolute", top: 2, left: on ? 16 : 2,
            width: 14, height: 14, borderRadius: 7,
            background: "#FFFFFF",
            transition: "left 200ms ease-out",
            boxShadow: "0 1px 2px rgba(0,0,0,0.15)",
          }}
        />
      </span>
      <span style={{ fontSize: 12, color: theme.muted, whiteSpace: "nowrap", userSelect: "none" }}>
        {label}
      </span>
    </button>
  );
}

function CheckmarkSVG({ theme }) {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <circle cx="7" cy="7" r="6.5" fill={theme.successBg} stroke={theme.success} strokeWidth="1" />
      <path d="M4 7.2L6 9.2L10 5" stroke={theme.success} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ErrorSVG({ theme }) {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <circle cx="7" cy="7" r="6.5" fill={theme.errorBg} stroke={theme.error} strokeWidth="1" />
      <path d="M5 5L9 9M9 5L5 9" stroke={theme.error} strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function SpinnerSVG({ theme }) {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" style={{ animation: "exif-spin 800ms linear infinite" }}>
      <circle cx="7" cy="7" r="5.5" fill="none" stroke={theme.border} strokeWidth="1.5" />
      <path d="M7 1.5A5.5 5.5 0 0 1 12.5 7" fill="none" stroke={theme.burgundy} strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

export default function ExifCleaner() {
  const [isDark, setIsDark] = useState(false);
  const [appState, setAppState] = useState("empty"); // empty | dragover | processing | complete
  const [files, setFiles] = useState([]);
  const [barVisible, setBarVisible] = useState(false);
  const [dragFlash, setDragFlash] = useState(false);
  const [toggles, setToggles] = useState({ orientation: true, originals: false, timestamps: true });
  const [processingIndex, setProcessingIndex] = useState(-1);
  const timerRefs = useRef([]);

  const t = isDark ? dark : light;

  const clearTimers = useCallback(() => {
    timerRefs.current.forEach(clearTimeout);
    timerRefs.current = [];
  }, []);

  const startProcessing = useCallback(() => {
    clearTimers();
    const initialFiles = FILES_DATA.map((f, i) => ({
      ...f, visible: false, state: "pending", currentAfter: null,
    }));
    setFiles(initialFiles);
    setAppState("processing");
    setBarVisible(true);
    setProcessingIndex(0);

    // Stagger file appearance
    FILES_DATA.forEach((_, i) => {
      const tid = setTimeout(() => {
        setFiles(prev => prev.map((f, j) => j === i ? { ...f, visible: true } : f));
      }, i * 100);
      timerRefs.current.push(tid);
    });

    // Process each file
    FILES_DATA.forEach((file, i) => {
      // Start processing
      const startTid = setTimeout(() => {
        setFiles(prev => prev.map((f, j) => j === i ? { ...f, state: "processing" } : f));
        setProcessingIndex(i);
      }, file.delay - 500);
      timerRefs.current.push(startTid);

      // Complete processing
      const endTid = setTimeout(() => {
        setFiles(prev => prev.map((f, j) =>
          j === i ? { ...f, state: file.status === "error" ? "error" : "done", currentAfter: file.afterTags } : f
        ));
        if (i === FILES_DATA.length - 1) {
          const doneTid = setTimeout(() => {
            setAppState("complete");
            setProcessingIndex(-1);
          }, 500);
          timerRefs.current.push(doneTid);
        }
      }, file.delay);
      timerRefs.current.push(endTid);
    });
  }, [clearTimers]);

  const handleAddFiles = useCallback(() => {
    setDragFlash(true);
    setAppState("dragover");
    const tid = setTimeout(() => {
      setDragFlash(false);
      startProcessing();
    }, 400);
    timerRefs.current.push(tid);
  }, [startProcessing]);

  const handleClear = useCallback(() => {
    clearTimers();
    setBarVisible(false);
    const tid = setTimeout(() => {
      setFiles([]);
      setAppState("empty");
      setProcessingIndex(-1);
    }, 200);
    timerRefs.current.push(tid);
  }, [clearTimers]);

  useEffect(() => () => clearTimers(), [clearTimers]);

  const successCount = files.filter(f => f.state === "done").length;
  const errorCount = files.filter(f => f.state === "error").length;
  const totalFiles = files.length;
  const currentProcessing = files.filter(f => f.state === "done" || f.state === "error").length;

  const statusText = () => {
    if (appState === "complete") {
      return (
        <span style={{ fontSize: 13, fontWeight: 500 }}>
          <span style={{ color: t.success }}>{successCount} cleaned</span>
          {errorCount > 0 && (
            <span>
              <span style={{ color: t.muted }}>, </span>
              <span style={{ color: t.error }}>{errorCount} error</span>
            </span>
          )}
        </span>
      );
    }
    if (appState === "processing") {
      return (
        <span style={{ fontSize: 13, color: t.secondary }}>
          Cleaning {Math.min(currentProcessing + 1, totalFiles)} of {totalFiles}…
        </span>
      );
    }
    return null;
  };

  const showFilesArea = appState === "processing" || appState === "complete";

  return (
    <div style={{ display: "flex", justifyContent: "center", alignItems: "center", minHeight: "100vh", background: isDark ? "#0a0a0b" : "#e8e9ed", fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif', padding: 24 }}>
      <style>{`
        @keyframes exif-spin { to { transform: rotate(360deg); } }
        @keyframes exif-pop { 0% { transform: scale(0); opacity: 0; } 50% { transform: scale(1.3); } 100% { transform: scale(1); opacity: 1; } }
        @keyframes exif-fadeIn { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes exif-shake { 0%, 100% { transform: translateX(0); } 25% { transform: translateX(-2px); } 75% { transform: translateX(2px); } }
      `}</style>

      {/* Window */}
      <div style={{
        width: 580, height: 400, borderRadius: 8, overflow: "hidden",
        background: t.bg, border: `1px solid ${t.border}`,
        boxShadow: isDark ? "0 8px 40px rgba(0,0,0,0.5)" : "0 8px 40px rgba(0,0,0,0.15)",
        display: "flex", flexDirection: "column", position: "relative",
      }}>
        {/* Title Bar */}
        <div style={{
          height: 38, background: t.chrome, borderBottom: `1px solid ${t.border}`,
          display: "flex", alignItems: "center", padding: "0 12px", flexShrink: 0,
          position: "relative",
        }}>
          <div style={{ display: "flex", gap: 8 }}>
            <div style={{ width: 12, height: 12, borderRadius: 6, background: "#FF5F57" }} />
            <div style={{ width: 12, height: 12, borderRadius: 6, background: "#FFBD2E" }} />
            <div style={{ width: 12, height: 12, borderRadius: 6, background: "#27C93F" }} />
          </div>
          <span style={{
            position: "absolute", left: "50%", transform: "translateX(-50%)",
            fontSize: 13, fontWeight: 500, color: t.heading, letterSpacing: "-0.01em",
          }}>
            ExifCleaner
          </span>
          <button
            onClick={() => setIsDark(!isDark)}
            style={{
              marginLeft: "auto", background: "none", border: "none",
              cursor: "pointer", fontSize: 16, padding: "2px 4px", lineHeight: 1,
              color: t.muted, transition: "color 100ms",
            }}
            onMouseEnter={e => e.target.style.color = t.body}
            onMouseLeave={e => e.target.style.color = t.muted}
            title={isDark ? "Switch to light mode" : "Switch to dark mode"}
          >
            {isDark ? "☀" : "☽"}
          </button>
        </div>

        {/* Content Area */}
        <div style={{ flex: 1, position: "relative", overflow: "hidden", display: "flex", flexDirection: "column" }}>

          {/* Empty / Drag-over State */}
          {(appState === "empty" || appState === "dragover") && (
            <div
              style={{
                flex: 1, display: "flex", alignItems: "center", justifyContent: "center",
                padding: 24,
              }}
              onDragOver={e => { e.preventDefault(); setAppState("dragover"); }}
              onDragLeave={() => setAppState("empty")}
              onDrop={e => { e.preventDefault(); handleAddFiles(); }}
            >
              <div style={{
                width: "100%", maxWidth: 420, padding: "40px 32px",
                border: `2px dashed ${appState === "dragover" ? t.gold : t.secondary}`,
                borderRadius: 8,
                background: appState === "dragover" ? (isDark ? "rgba(248,208,87,0.05)" : "rgba(248,208,87,0.05)") : "transparent",
                display: "flex", flexDirection: "column", alignItems: "center", gap: 12,
                transition: "all 150ms ease-out",
              }}>
                {appState === "dragover" ? (
                  <span style={{ fontSize: 15, fontWeight: 600, color: t.gold }}>
                    Release to clean
                  </span>
                ) : (
                  <>
                    {/* Images Icon */}
                    <svg width="40" height="40" viewBox="0 0 40 40" fill="none">
                      <rect x="4" y="8" width="24" height="24" rx="3" stroke={t.muted} strokeWidth="1.5" fill="none" />
                      <rect x="12" y="8" width="24" height="24" rx="3" stroke={t.muted} strokeWidth="1.5" fill={t.bg} />
                      <circle cx="21" cy="17" r="3" stroke={t.muted} strokeWidth="1.5" fill="none" />
                      <path d="M12 28L18 22L22 26L26 21L36 32" stroke={t.muted} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
                    </svg>
                    <div style={{ textAlign: "center" }}>
                      <div style={{ fontSize: 15, color: t.body, fontWeight: 500, marginBottom: 2 }}>
                        Drop files here to
                      </div>
                      <div style={{ fontSize: 15, color: t.body, fontWeight: 500 }}>
                        remove metadata
                      </div>
                    </div>
                    <button
                      onClick={handleAddFiles}
                      style={{
                        background: "none", border: "none", cursor: "pointer",
                        fontSize: 14, color: t.muted, padding: "6px 16px", borderRadius: 4,
                        transition: "color 100ms",
                      }}
                      onMouseEnter={e => e.target.style.color = t.body}
                      onMouseLeave={e => e.target.style.color = t.muted}
                    >
                      Add files
                    </button>
                  </>
                )}
              </div>
            </div>
          )}

          {/* File Table */}
          {showFilesArea && (
            <div style={{
              flex: 1, overflow: "auto", padding: "0 16px",
              opacity: 1, transition: "opacity 200ms",
            }}>
              {/* Table Header */}
              <div style={{
                display: "grid", gridTemplateColumns: "1fr 72px 90px",
                padding: "12px 8px 8px", borderBottom: `1px solid ${t.border}`,
                fontSize: 12, fontWeight: 600, color: t.muted, letterSpacing: "0.02em",
                textTransform: "uppercase",
              }}>
                <span>Filename</span>
                <span style={{ textAlign: "right" }}>Before</span>
                <span style={{ textAlign: "right" }}>After</span>
              </div>

              {/* File Rows */}
              {files.map((file, i) => (
                <div
                  key={file.name}
                  style={{
                    display: "grid", gridTemplateColumns: "1fr 72px 90px",
                    alignItems: "center",
                    padding: "7px 8px",
                    borderBottom: i < files.length - 1 ? `1px solid ${isDark ? "#252528" : "#f0f1f3"}` : "none",
                    opacity: file.visible ? 1 : 0,
                    transform: file.visible ? "translateY(0)" : "translateY(4px)",
                    transition: "opacity 200ms ease, transform 200ms ease",
                  }}
                >
                  {/* Filename + status icon */}
                  <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                    <span style={{ flexShrink: 0, width: 14, height: 14, display: "flex", alignItems: "center", justifyContent: "center" }}>
                      {file.state === "processing" && <SpinnerSVG theme={t} />}
                      {file.state === "done" && (
                        <span style={{ animation: "exif-pop 300ms cubic-bezier(0.34, 1.56, 0.64, 1) forwards" }}>
                          <CheckmarkSVG theme={t} />
                        </span>
                      )}
                      {file.state === "error" && (
                        <span style={{ animation: "exif-shake 300ms ease" }}>
                          <ErrorSVG theme={t} />
                        </span>
                      )}
                      {file.state === "pending" && (
                        <span style={{ width: 6, height: 6, borderRadius: 3, background: t.muted, opacity: 0.4 }} />
                      )}
                    </span>
                    <span style={{
                      fontSize: 14, color: file.state === "error" ? t.error : t.body,
                      overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                    }}>
                      {file.name}
                    </span>
                  </div>

                  {/* Before */}
                  <span style={{
                    fontSize: 13, color: t.muted, textAlign: "right",
                    fontVariantNumeric: "tabular-nums",
                  }}>
                    {file.beforeTags != null ? file.beforeTags : "—"}
                  </span>

                  {/* After */}
                  <span style={{
                    fontSize: 13, textAlign: "right",
                    fontVariantNumeric: "tabular-nums",
                    color: file.state === "error" ? t.error : file.currentAfter != null ? t.success : t.muted,
                  }}>
                    {file.state === "done" ? "0" : file.state === "error" ? (
                      <span style={{ fontSize: 12 }}>Can't read file</span>
                    ) : file.state === "processing" ? (
                      <span style={{ letterSpacing: 1 }}>…</span>
                    ) : "—"}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Bottom Bar */}
        <div style={{
          height: barVisible ? 48 : 0,
          overflow: "hidden",
          transition: "height 200ms ease-out",
          flexShrink: 0,
        }}>
          <div style={{
            height: 48, background: t.barBg, borderTop: `1px solid ${t.border}`,
            display: "flex", alignItems: "center", justifyContent: "space-between",
            padding: "0 16px",
          }}>
            {/* Left: Toggles */}
            <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
              <Toggle label="Orientation" on={toggles.orientation} onChange={() => setToggles(p => ({ ...p, orientation: !p.orientation }))} theme={t} />
              <Toggle label="Originals" on={toggles.originals} onChange={() => setToggles(p => ({ ...p, originals: !p.originals }))} theme={t} />
              <Toggle label="Timestamps" on={toggles.timestamps} onChange={() => setToggles(p => ({ ...p, timestamps: !p.timestamps }))} theme={t} />
            </div>

            {/* Center: Status */}
            <div style={{ position: "absolute", left: "50%", transform: "translateX(-50%)" }}>
              {statusText()}
            </div>

            {/* Right: Clear */}
            <button
              onClick={handleClear}
              style={{
                background: "none", border: "none", cursor: "pointer",
                fontSize: 13, color: t.muted, padding: "4px 8px",
                borderRadius: 4, transition: "color 100ms",
              }}
              onMouseEnter={e => e.target.style.color = t.body}
              onMouseLeave={e => e.target.style.color = t.muted}
            >
              Clear
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
