import { useState, useEffect, useCallback, useRef } from "react";

const FAKE_FILES = [
  { name: "vacation_photo.jpg", ext: "JPG", beforeTags: 23, afterTags: 0, status: "success", processTime: 1000 },
  { name: "selfie_park.heic", ext: "HEIC", beforeTags: 45, afterTags: 0, status: "success", processTime: 1000 },
  { name: "portrait.png", ext: "PNG", beforeTags: 8, afterTags: 0, status: "success", processTime: 800 },
  { name: "corrupt_file.pdf", ext: "PDF", beforeTags: null, afterTags: null, status: "error", processTime: 800 },
  { name: "scan_receipt.pdf", ext: "PDF", beforeTags: 12, afterTags: 0, status: "success", processTime: 800 },
  { name: "IMG_2847.mov", ext: "MOV", beforeTags: 67, afterTags: 0, status: "success", processTime: 800 },
];

const light = {
  bg: "#F5F6F8", card: "#FFFFFF", border: "#DADEE4", body: "#3B4351", heading: "#1E2028",
  muted: "#9BA3B0", secondary: "#66758C", chrome: "#FAFAFA", burgundy: "#521737",
  gold: "#F8D057", orange: "#E97043", success: "#2D8659", successBg: "#E8F5EE",
  error: "#C44536", errorBg: "#FCEAE8",
};
const dark = {
  bg: "#141416", card: "#1C1C1F", border: "#48484D", body: "#C5C5CB", heading: "#EEEEF0",
  muted: "#818188", secondary: "#66758C", chrome: "#0E0E10", burgundy: "#C4467A",
  gold: "#F8D057", orange: "#E97043", success: "#2D8659", successBg: "#1A3D2B",
  error: "#C44536", errorBg: "#3D1A16",
};

// Icons as inline SVGs
const ImageIcon = ({ color, size = 48 }) => (
  <svg width={size} height={size} viewBox="0 0 48 48" fill="none">
    <rect x="6" y="10" width="36" height="28" rx="4" stroke={color} strokeWidth="2.5" fill="none" />
    <circle cx="18" cy="22" r="4" stroke={color} strokeWidth="2" fill="none" />
    <path d="M6 32l10-8 6 5 8-10 12 13" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
  </svg>
);

const CheckIcon = ({ color, size = 48 }) => (
  <svg width={size} height={size} viewBox="0 0 48 48" fill="none">
    <path d="M12 25l8 8 16-18" stroke={color} strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const XIcon = ({ color, size = 16 }) => (
  <svg width={size} height={size} viewBox="0 0 16 16" fill="none">
    <path d="M4 4l8 8M12 4l-8 8" stroke={color} strokeWidth="2" strokeLinecap="round" />
  </svg>
);

const GearIcon = ({ color, size = 18 }) => (
  <svg width={size} height={size} viewBox="0 0 20 20" fill="none">
    <path d="M10 13a3 3 0 100-6 3 3 0 000 6z" stroke={color} strokeWidth="1.5" />
    <path d="M8.5 2.5l-.4 1.7a6.5 6.5 0 00-2 1.1L4.5 4.5l-1.5 2.6 1.3 1.2a6.5 6.5 0 000 2.3L3 11.9l1.5 2.6 1.6-.8a6.5 6.5 0 002 1.1l.4 1.7h3l.4-1.7a6.5 6.5 0 002-1.1l1.6.8 1.5-2.6-1.3-1.2a6.5 6.5 0 000-2.3L17 7.1l-1.5-2.6-1.6.8a6.5 6.5 0 00-2-1.1L11.5 2.5h-3z" stroke={color} strokeWidth="1.5" strokeLinejoin="round" />
  </svg>
);

const SpinnerIcon = ({ color, size = 20 }) => (
  <svg width={size} height={size} viewBox="0 0 20 20" fill="none" style={{ animation: "spin 1s linear infinite" }}>
    <circle cx="10" cy="10" r="8" stroke={color} strokeWidth="2" opacity="0.25" />
    <path d="M10 2a8 8 0 016.93 4" stroke={color} strokeWidth="2" strokeLinecap="round" />
  </svg>
);

export default function ExifCleaner() {
  const [isDark, setIsDark] = useState(true);
  const [appState, setAppState] = useState("empty"); // empty, dragover, processing, complete
  const [currentIndex, setCurrentIndex] = useState(0);
  const [fileStates, setFileStates] = useState([]); // "pending" | "processing" | "success" | "error"
  const [cardPhase, setCardPhase] = useState("idle"); // idle, entering, visible, processing, done, exiting
  const [showSettings, setShowSettings] = useState(false);
  const [settings, setSettings] = useState({ orientation: true, keepOriginals: false, timestamps: true });
  const [summaryVisible, setSummaryVisible] = useState(false);
  const processingRef = useRef(false);

  const t = isDark ? dark : light;

  const startProcessing = useCallback(() => {
    const states = FAKE_FILES.map(() => "pending");
    setFileStates(states);
    setCurrentIndex(0);
    setAppState("processing");
    setCardPhase("idle");
    setSummaryVisible(false);
    processingRef.current = true;
  }, []);

  // Processing orchestration
  useEffect(() => {
    if (appState !== "processing" || !processingRef.current) return;
    if (currentIndex >= FAKE_FILES.length) {
      // All done — show summary
      setTimeout(() => {
        setCardPhase("exiting");
        setTimeout(() => {
          setAppState("complete");
          setTimeout(() => setSummaryVisible(true), 50);
        }, 350);
      }, 800);
      processingRef.current = false;
      return;
    }

    // Entrance
    setCardPhase("entering");
    setTimeout(() => setCardPhase("visible"), 50);

    // Start processing after entrance
    const processDelay = setTimeout(() => {
      setCardPhase("processing");
      setFileStates(prev => {
        const n = [...prev];
        n[currentIndex] = "processing";
        return n;
      });

      const file = FAKE_FILES[currentIndex];
      // Complete after processing time
      const completeDelay = setTimeout(() => {
        setFileStates(prev => {
          const n = [...prev];
          n[currentIndex] = file.status;
          return n;
        });
        setCardPhase("done");

        // Hold then exit
        const exitDelay = setTimeout(() => {
          if (currentIndex < FAKE_FILES.length - 1) {
            setCardPhase("exiting");
            setTimeout(() => {
              setCurrentIndex(i => i + 1);
            }, 350);
          } else {
            // Last file — let the effect re-run to hit the "all done" branch
            setCurrentIndex(i => i + 1);
          }
        }, 800);
        return () => clearTimeout(exitDelay);
      }, file.processTime);
      return () => clearTimeout(completeDelay);
    }, 400);

    return () => clearTimeout(processDelay);
  }, [appState, currentIndex]);

  const handleDragOver = (e) => {
    e.preventDefault();
    if (appState === "empty") setAppState("dragover");
  };
  const handleDragLeave = () => {
    if (appState === "dragover") setAppState("empty");
  };
  const handleDrop = (e) => {
    e.preventDefault();
    startProcessing();
  };

  const reset = () => {
    setAppState("empty");
    setCurrentIndex(0);
    setFileStates([]);
    setCardPhase("idle");
    setSummaryVisible(false);
    processingRef.current = false;
  };

  const file = FAKE_FILES[currentIndex] || FAKE_FILES[FAKE_FILES.length - 1];
  const successCount = fileStates.filter(s => s === "success").length;
  const errorCount = fileStates.filter(s => s === "error").length;
  const totalTagsRemoved = FAKE_FILES.reduce((sum, f, i) => fileStates[i] === "success" ? sum + (f.beforeTags || 0) : sum, 0);

  const cardTransform = (() => {
    switch (cardPhase) {
      case "entering": return "translateX(60px) scale(0.95)";
      case "exiting": return "translateX(-60px) scale(0.95)";
      default: return "translateX(0) scale(1)";
    }
  })();
  const cardOpacity = (cardPhase === "entering" || cardPhase === "exiting" || cardPhase === "idle") ? 0 : 1;

  const cardBorderColor = (() => {
    if (cardPhase === "processing") return t.gold;
    if (cardPhase === "done" && file.status === "success") return t.success;
    if (cardPhase === "done" && file.status === "error") return t.error;
    return t.border;
  })();

  return (
    <div style={{
      width: 580, height: 400, borderRadius: 12, overflow: "hidden",
      fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      background: t.bg, color: t.body, position: "relative",
      boxShadow: isDark ? "0 20px 60px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.06)" : "0 20px 60px rgba(0,0,0,0.15), 0 0 0 1px rgba(0,0,0,0.06)",
      userSelect: "none",
    }}>
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes pulse { 0%, 100% { opacity: 0.6; } 50% { opacity: 1; } }
        @keyframes springPop { 0% { transform: scale(0); } 60% { transform: scale(1.2); } 100% { transform: scale(1); } }
        @keyframes dotPulse { 0%, 100% { opacity: 0.5; } 50% { opacity: 1; } }
        @keyframes goldGlow { 0%, 100% { box-shadow: 0 0 12px rgba(248,208,87,0.15); } 50% { box-shadow: 0 0 24px rgba(248,208,87,0.3); } }
      `}</style>

      {/* Title Bar */}
      <div style={{
        height: 38, background: t.chrome, display: "flex", alignItems: "center",
        padding: "0 16px", borderBottom: `1px solid ${t.border}`, justifyContent: "space-between",
      }}>
        <div style={{ display: "flex", gap: 7, alignItems: "center" }}>
          <div style={{ width: 12, height: 12, borderRadius: 6, background: "#FF5F57" }} />
          <div style={{ width: 12, height: 12, borderRadius: 6, background: "#FEBC2E" }} />
          <div style={{ width: 12, height: 12, borderRadius: 6, background: "#28C840" }} />
        </div>
        <span style={{ fontSize: 13, fontWeight: 600, color: t.muted, letterSpacing: 0.3 }}>ExifCleaner</span>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <button onClick={() => setShowSettings(true)} style={{
            background: "none", border: "none", cursor: "pointer", padding: 4,
            borderRadius: 6, display: "flex", alignItems: "center",
          }}>
            <GearIcon color={t.muted} />
          </button>
          <button onClick={() => setIsDark(!isDark)} style={{
            background: "none", border: "none", cursor: "pointer", padding: 4,
            fontSize: 16, borderRadius: 6, lineHeight: 1,
          }}>
            {isDark ? "☀" : "☽"}
          </button>
        </div>
      </div>

      {/* Content Area */}
      <div
        style={{
          height: 362, display: "flex", flexDirection: "column",
          alignItems: "center", justifyContent: "center", position: "relative",
          background: appState === "dragover" ? (isDark ? "rgba(248,208,87,0.05)" : "rgba(248,208,87,0.08)") : "transparent",
          transition: "background 150ms ease",
        }}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        {/* State 1 & 2: Empty / Drag Over */}
        {(appState === "empty" || appState === "dragover") && (
          <div style={{
            display: "flex", flexDirection: "column", alignItems: "center", gap: 12,
            opacity: 1, transition: "all 200ms ease",
          }}>
            <div style={{ opacity: appState === "dragover" ? 1 : 0.5, transition: "opacity 150ms" }}>
              <ImageIcon color={appState === "dragover" ? t.gold : t.muted} size={52} />
            </div>
            <div style={{ textAlign: "center" }}>
              <div style={{
                fontSize: 17, fontWeight: appState === "dragover" ? 600 : 400,
                color: appState === "dragover" ? t.gold : t.heading,
                transition: "all 150ms",
              }}>
                {appState === "dragover" ? "Release to clean" : "Drop files here to"}
              </div>
              {appState !== "dragover" && (
                <div style={{ fontSize: 17, color: t.heading }}>remove metadata</div>
              )}
            </div>
            <button
              onClick={startProcessing}
              style={{
                marginTop: 8, padding: "8px 24px", borderRadius: 8,
                background: appState === "dragover" ? t.gold : "transparent",
                color: appState === "dragover" ? "#1E2028" : t.secondary,
                border: appState === "dragover" ? "none" : `1.5px solid ${t.border}`,
                fontSize: 14, fontWeight: 500, cursor: "pointer",
                transition: "all 150ms",
              }}
            >
              Add files
            </button>
          </div>
        )}

        {/* State 3: Processing */}
        {appState === "processing" && currentIndex < FAKE_FILES.length && (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 24, width: "100%" }}>
            {/* File Card */}
            <div style={{
              width: 400, background: t.card, borderRadius: 12, padding: "28px 32px",
              border: `2px solid ${cardBorderColor}`,
              transform: cardTransform, opacity: cardOpacity,
              transition: "transform 350ms ease-out, opacity 300ms ease-out, border-color 300ms ease",
              animation: cardPhase === "processing" ? "goldGlow 2s ease infinite" : "none",
              boxShadow: isDark ? "0 8px 32px rgba(0,0,0,0.4)" : "0 8px 32px rgba(0,0,0,0.08)",
            }}>
              {/* Filename */}
              <div style={{ textAlign: "center", marginBottom: 4 }}>
                <div style={{ fontSize: 20, fontWeight: 500, color: t.heading }}>{file.name}</div>
                <span style={{
                  display: "inline-block", marginTop: 6, padding: "2px 10px", borderRadius: 99,
                  background: isDark ? "rgba(255,255,255,0.07)" : "rgba(0,0,0,0.05)",
                  fontSize: 11, fontWeight: 600, color: t.muted, letterSpacing: 0.8,
                }}>{file.ext}</span>
              </div>

              {/* Before / After */}
              <div style={{ display: "flex", justifyContent: "center", gap: 48, margin: "24px 0 20px" }}>
                <div style={{ textAlign: "center" }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: t.muted, letterSpacing: 1, textTransform: "uppercase", marginBottom: 8 }}>Before</div>
                  <div style={{ fontSize: 36, fontWeight: 500, color: t.heading, lineHeight: 1 }}>
                    {file.beforeTags !== null ? file.beforeTags : "—"}
                  </div>
                  <div style={{ fontSize: 12, color: t.muted, marginTop: 4 }}>tags</div>
                </div>
                <div style={{ width: 1, background: t.border, alignSelf: "stretch", margin: "8px 0" }} />
                <div style={{ textAlign: "center" }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: t.muted, letterSpacing: 1, textTransform: "uppercase", marginBottom: 8 }}>After</div>
                  <div style={{ fontSize: 36, fontWeight: 500, lineHeight: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
                    {cardPhase === "processing" ? (
                      <span style={{ color: t.gold, animation: "pulse 1.5s ease infinite" }}>
                        <SpinnerIcon color={t.gold} size={28} />
                      </span>
                    ) : cardPhase === "done" && file.status === "success" ? (
                      <span style={{ color: t.success, animation: "springPop 300ms cubic-bezier(0.34,1.56,0.64,1) forwards" }}>0</span>
                    ) : cardPhase === "done" && file.status === "error" ? (
                      <span style={{ color: t.error }}>—</span>
                    ) : (
                      <span style={{ color: t.muted }}>—</span>
                    )}
                  </div>
                  <div style={{ fontSize: 12, color: t.muted, marginTop: 4 }}>tags</div>
                </div>
              </div>

              {/* Status */}
              <div style={{ textAlign: "center", fontSize: 14, fontWeight: 500 }}>
                {cardPhase === "processing" && (
                  <span style={{ color: t.gold, display: "inline-flex", alignItems: "center", gap: 6 }}>
                    <SpinnerIcon color={t.gold} size={14} /> Cleaning…
                  </span>
                )}
                {cardPhase === "done" && file.status === "success" && (
                  <span style={{ color: t.success, display: "inline-flex", alignItems: "center", gap: 5 }}>
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                      <path d="M3 8.5l3.5 3.5 6.5-7" stroke={t.success} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                    Metadata removed
                  </span>
                )}
                {cardPhase === "done" && file.status === "error" && (
                  <span style={{ color: t.error, display: "inline-flex", alignItems: "center", gap: 5 }}>
                    <XIcon color={t.error} size={14} /> Can't read file
                  </span>
                )}
                {(cardPhase === "entering" || cardPhase === "visible") && (
                  <span style={{ color: t.muted }}>Queued</span>
                )}
              </div>
            </div>

            {/* Progress Dots */}
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10 }}>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                {FAKE_FILES.map((_, i) => {
                  const state = fileStates[i] || "pending";
                  const isCurrent = i === currentIndex;
                  const dotBg = state === "success" ? t.success
                    : state === "error" ? t.error
                    : state === "processing" ? t.gold
                    : "transparent";
                  const dotBorder = state === "pending" ? t.border : dotBg;
                  return (
                    <div key={i} style={{
                      width: 10, height: 10, borderRadius: 5,
                      background: dotBg,
                      border: `2px solid ${dotBorder}`,
                      transition: "all 200ms ease-out",
                      animation: state === "processing" ? "dotPulse 1.5s ease infinite" : "none",
                      transform: isCurrent ? "scale(1.25)" : "scale(1)",
                    }} />
                  );
                })}
              </div>
              <div style={{ fontSize: 13, fontWeight: 600, color: t.muted }}>
                {Math.min(currentIndex + 1, FAKE_FILES.length)} of {FAKE_FILES.length} files
              </div>
            </div>
          </div>
        )}

        {/* State 4: Complete */}
        {appState === "complete" && (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 24, width: "100%" }}>
            {/* Summary Card */}
            <div style={{
              width: 400, background: t.card, borderRadius: 12, padding: "32px",
              border: `2px solid ${t.success}`,
              boxShadow: isDark ? "0 8px 32px rgba(0,0,0,0.4)" : "0 8px 32px rgba(0,0,0,0.08)",
              textAlign: "center",
              opacity: summaryVisible ? 1 : 0,
              transform: summaryVisible ? "scale(1)" : "scale(0.95)",
              transition: "all 400ms ease-out",
            }}>
              <div style={{ animation: summaryVisible ? "springPop 400ms cubic-bezier(0.34,1.56,0.64,1) forwards" : "none" }}>
                <CheckIcon color={t.success} size={52} />
              </div>
              <div style={{ fontSize: 20, fontWeight: 500, color: t.heading, marginTop: 4 }}>
                All files clean
              </div>
              <div style={{ fontSize: 14, marginTop: 14, display: "flex", justifyContent: "center", gap: 6, flexWrap: "wrap" }}>
                <span style={{ color: t.success, fontWeight: 600 }}>{successCount} cleaned</span>
                {errorCount > 0 && (
                  <>
                    <span style={{ color: t.muted }}>·</span>
                    <span style={{ color: t.error, fontWeight: 600 }}>{errorCount} error</span>
                  </>
                )}
              </div>
              <div style={{ fontSize: 14, color: t.muted, marginTop: 6 }}>
                {totalTagsRemoved} metadata tags removed
              </div>
              <button onClick={reset} style={{
                marginTop: 20, padding: "8px 24px", borderRadius: 8,
                background: "transparent", color: t.secondary, fontSize: 14, fontWeight: 500,
                border: `1.5px solid ${t.border}`, cursor: "pointer",
                transition: "all 150ms",
              }}>
                Clean more
              </button>
            </div>

            {/* Final Dots */}
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10 }}>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                {FAKE_FILES.map((_, i) => {
                  const state = fileStates[i] || "pending";
                  const dotBg = state === "success" ? t.success : state === "error" ? t.error : t.border;
                  return (
                    <div key={i} style={{
                      width: 10, height: 10, borderRadius: 5,
                      background: dotBg, border: `2px solid ${dotBg}`,
                      transition: "all 200ms ease-out",
                    }} />
                  );
                })}
              </div>
              <div style={{ fontSize: 13, fontWeight: 600, color: t.success }}>All done</div>
            </div>
          </div>
        )}
      </div>

      {/* Settings Modal */}
      {showSettings && (
        <div style={{
          position: "absolute", inset: 0, background: "rgba(0,0,0,0.5)",
          display: "flex", alignItems: "center", justifyContent: "center",
          zIndex: 100, backdropFilter: "blur(4px)",
        }} onClick={(e) => { if (e.target === e.currentTarget) setShowSettings(false); }}>
          <div style={{
            width: 320, background: t.card, borderRadius: 12, padding: 24,
            border: `1px solid ${t.border}`,
            boxShadow: isDark ? "0 16px 48px rgba(0,0,0,0.6)" : "0 16px 48px rgba(0,0,0,0.15)",
          }} onClick={e => e.stopPropagation()}>
            <div style={{ fontSize: 17, fontWeight: 600, color: t.heading, marginBottom: 20 }}>Settings</div>
            {[
              { key: "orientation", label: "Preserve image orientation", sub: null },
              { key: "keepOriginals", label: "Keep original files", sub: "Saves cleaned copies as filename_cleaned.ext" },
              { key: "timestamps", label: "Preserve file timestamps", sub: null },
            ].map(({ key, label, sub }) => (
              <label key={key} style={{
                display: "flex", gap: 12, alignItems: "flex-start", cursor: "pointer",
                marginBottom: 16, fontSize: 14, color: t.body,
              }}>
                <div style={{
                  width: 18, height: 18, borderRadius: 4, flexShrink: 0, marginTop: 1,
                  border: `2px solid ${settings[key] ? t.gold : t.border}`,
                  background: settings[key] ? t.gold : "transparent",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  transition: "all 150ms",
                }} onClick={() => setSettings(s => ({ ...s, [key]: !s[key] }))}>
                  {settings[key] && (
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                      <path d="M2.5 6l2.5 2.5 4.5-5" stroke="#1E2028" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  )}
                </div>
                <div>
                  <div>{label}</div>
                  {sub && <div style={{ fontSize: 12, color: t.muted, marginTop: 2 }}>{sub}</div>}
                </div>
              </label>
            ))}
            <button onClick={() => setShowSettings(false)} style={{
              marginTop: 8, width: "100%", padding: "10px 0", borderRadius: 8,
              background: t.gold, color: "#1E2028", border: "none",
              fontSize: 14, fontWeight: 600, cursor: "pointer",
            }}>
              Done
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
