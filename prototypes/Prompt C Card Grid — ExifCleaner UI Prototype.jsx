import { useState, useEffect, useRef, useCallback } from "react";

const FILES_DATA = [
  { id: 1, name: "vacation_photo.jpg", ext: ".jpg", beforeTags: 23, afterTags: 0, status: "success", delay: 1500 },
  { id: 2, name: "selfie_park.heic", ext: ".heic", beforeTags: 45, afterTags: 0, status: "success", delay: 2000 },
  { id: 3, name: "portrait.png", ext: ".png", beforeTags: 8, afterTags: 0, status: "success", delay: 2500 },
  { id: 4, name: "corrupt_file.pdf", ext: ".pdf", beforeTags: null, afterTags: null, status: "error", delay: 3000, error: "Can't read file" },
  { id: 5, name: "scan_receipt.pdf", ext: ".pdf", beforeTags: 12, afterTags: 0, status: "success", delay: 3500 },
  { id: 6, name: "IMG_2847.mov", ext: ".mov", beforeTags: 67, afterTags: 0, status: "success", delay: 4000 },
];

const DETAIL_TAGS = [
  ["GPS Latitude", "37.7749° N"],
  ["GPS Longitude", "-122.4194° W"],
  ["Camera Make", "Canon"],
  ["Camera Model", "EOS R5"],
  ["Lens", "RF 24-70mm"],
  ["Focal Length", "35mm"],
  ["ISO", "400"],
  ["Shutter Speed", "1/250"],
  ["Aperture", "f/2.8"],
  ["Date/Time Original", "2025-08-14 16:32:10"],
  ["Software", "Adobe Lightroom"],
];

const THEMES = {
  light: {
    bg: "#F5F6F8", card: "#FFFFFF", cardBorder: "#DADEE4", body: "#3B4351",
    heading: "#1E2028", muted: "#9BA3B0", secondary: "#66758C", chrome: "#FAFAFA",
    burgundy: "#521737", gold: "#F8D057", orange: "#E97043",
    success: "#2D8659", successBg: "#E8F5EE", error: "#C44536", errorBg: "#FCEAE8",
    info: "#3B7FC4", infoBg: "#E5F0FA", badgeBg: "#E8EAF0", overlayBg: "rgba(0,0,0,0.08)",
  },
  dark: {
    bg: "#141416", card: "#1C1C1F", cardBorder: "#48484D", body: "#C5C5CB",
    heading: "#EEEEF0", muted: "#818188", secondary: "#A0A0A8", chrome: "#0E0E10",
    burgundy: "#C4467A", gold: "#F8D057", orange: "#E97043",
    success: "#2D8659", successBg: "#1A3D2B", error: "#C44536", errorBg: "#3D1A16",
    info: "#3B7FC4", infoBg: "#1A2D3D", badgeBg: "#2A2A2E", overlayBg: "rgba(0,0,0,0.4)",
  },
};

export default function ExifCleaner() {
  const [theme, setTheme] = useState("light");
  const [appState, setAppState] = useState("empty"); // empty | dragover | processing | complete
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [files, setFiles] = useState([]);
  const [visibleCards, setVisibleCards] = useState(new Set());
  const [processingId, setProcessingId] = useState(null);
  const [completedIds, setCompletedIds] = useState(new Set());
  const [selectedCard, setSelectedCard] = useState(null);
  const [showAllTags, setShowAllTags] = useState(false);
  const [showClear, setShowClear] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [settings, setSettings] = useState({
    preserveOrientation: true,
    keepOriginals: false,
    preserveFileDates: true,
  });

  const t = THEMES[theme];
  const cardAreaRef = useRef(null);
  const timeoutsRef = useRef([]);

  const clearTimeouts = () => {
    timeoutsRef.current.forEach(clearTimeout);
    timeoutsRef.current = [];
  };

  const addTimeout = (fn, ms) => {
    const id = setTimeout(fn, ms);
    timeoutsRef.current.push(id);
    return id;
  };

  const startProcessing = useCallback(() => {
    clearTimeouts();
    setAppState("processing");
    setFiles(FILES_DATA);
    setVisibleCards(new Set());
    setCompletedIds(new Set());
    setProcessingId(null);
    setSelectedCard(null);
    setShowClear(false);
    setClearing(false);
    setShowAllTags(false);

    // Stagger card entrance
    FILES_DATA.forEach((file, i) => {
      addTimeout(() => {
        setVisibleCards(prev => new Set([...prev, file.id]));
      }, i * 80);
    });

    // Start processing after cards appear
    addTimeout(() => setProcessingId(FILES_DATA[0].id), 500);

    // Complete each file
    FILES_DATA.forEach((file) => {
      addTimeout(() => {
        setCompletedIds(prev => new Set([...prev, file.id]));
        setProcessingId(null);
        const nextFile = FILES_DATA.find(f => f.delay > file.delay);
        if (nextFile) {
          addTimeout(() => setProcessingId(nextFile.id), 100);
        }
      }, file.delay);
    });

    // Show clear button and set complete
    addTimeout(() => {
      setShowClear(true);
      setAppState("complete");
    }, 4500);
  }, []);

  const handleClear = () => {
    setClearing(true);
    addTimeout(() => {
      setAppState("empty");
      setFiles([]);
      setVisibleCards(new Set());
      setCompletedIds(new Set());
      setProcessingId(null);
      setSelectedCard(null);
      setShowClear(false);
      setClearing(false);
      setShowAllTags(false);
    }, 300);
  };

  const getCardState = (file) => {
    if (completedIds.has(file.id)) return file.status === "error" ? "error" : "complete";
    if (processingId === file.id) return "processing";
    return "pending";
  };

  const handleCardClick = (file, e) => {
    const state = getCardState(file);
    if (state === "complete" || state === "error") {
      if (selectedCard === file.id) {
        setSelectedCard(null);
        setShowAllTags(false);
      } else {
        setSelectedCard(file.id);
        setShowAllTags(false);
      }
    }
  };

  useEffect(() => {
    const handler = (e) => {
      if (selectedCard && !e.target.closest("[data-card]") && !e.target.closest("[data-overlay]")) {
        setSelectedCard(null);
        setShowAllTags(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [selectedCard]);

  // Keyboard shortcut
  useEffect(() => {
    const handler = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        if (showClear) handleClear();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [showClear]);

  const Spinner = ({ size = 14, color }) => (
    <svg width={size} height={size} viewBox="0 0 16 16" style={{ animation: "spin 0.8s linear infinite" }}>
      <circle cx="8" cy="8" r="6" fill="none" stroke={color} strokeWidth="2" strokeDasharray="28" strokeDashoffset="8" strokeLinecap="round" />
    </svg>
  );

  const Card = ({ file, index }) => {
    const state = getCardState(file);
    const isSelected = selectedCard === file.id;

    let borderColor = t.cardBorder;
    let borderWidth = "1px";
    let boxShadow = "0 1px 2px rgba(0,0,0,0.05)";
    let bgColor = t.card;
    let glowShadow = "";

    if (state === "processing") {
      borderColor = t.gold;
      borderWidth = "2px";
      glowShadow = `, 0 0 0 3px rgba(248, 208, 87, 0.3)`;
    } else if (state === "complete") {
      borderColor = t.success;
      borderWidth = "2px";
    } else if (state === "error") {
      borderColor = t.error;
      borderWidth = "2px";
      bgColor = t.errorBg;
    }

    const visible = visibleCards.has(file.id);

    return (
      <div style={{ position: "relative" }} data-card>
        <div
          onClick={(e) => handleCardClick(file, e)}
          style={{
            background: bgColor,
            border: `${borderWidth} solid ${borderColor}`,
            borderRadius: 8,
            padding: 16,
            cursor: state === "complete" || state === "error" ? "pointer" : "default",
            boxShadow: boxShadow + glowShadow,
            transform: !visible ? "scale(0.9)" : clearing ? "scale(0.9)" : "scale(1)",
            opacity: !visible ? 0 : clearing ? 0 : 1,
            transition: "all 200ms ease-out, transform 200ms ease-out, opacity 200ms ease-out, box-shadow 150ms ease-out",
            minHeight: 100,
            display: "flex",
            flexDirection: "column",
            gap: 8,
            position: "relative",
            userSelect: "none",
          }}
          onMouseEnter={(e) => {
            if (state === "complete" || state === "error") {
              e.currentTarget.style.boxShadow = `0 4px 12px rgba(0,0,0,0.1)${glowShadow}`;
              e.currentTarget.style.transform = "translateY(-2px)";
            }
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.boxShadow = boxShadow + glowShadow;
            e.currentTarget.style.transform = "scale(1)";
          }}
        >
          {/* Status + Filename */}
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ flexShrink: 0, display: "flex", alignItems: "center" }}>
              {state === "pending" && <span style={{ width: 10, height: 10, borderRadius: "50%", background: t.muted, display: "inline-block" }} />}
              {state === "processing" && <Spinner color={t.gold} />}
              {state === "complete" && (
                <span style={{ color: t.success, fontWeight: 700, fontSize: 14, animation: "popIn 300ms ease-out" }}>✓</span>
              )}
              {state === "error" && (
                <span style={{ color: t.error, fontWeight: 700, fontSize: 14 }}>✗</span>
              )}
            </span>
            <span style={{
              fontSize: 14, fontWeight: 600, lineHeight: 1.25, color: t.heading,
              overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1,
            }}>
              {file.name}
            </span>
          </div>

          {/* Extension badge */}
          <div>
            <span style={{
              fontSize: 10, fontWeight: 600, textTransform: "uppercase",
              background: t.badgeBg, color: t.muted,
              padding: "2px 6px", borderRadius: 9999, lineHeight: 1.4,
              display: "inline-block",
            }}>
              {file.ext}
            </span>
          </div>

          {/* Tag counts */}
          <div style={{ fontSize: 12, color: t.muted, lineHeight: 1.5 }}>
            {state === "pending" && "Before: —  After: —"}
            {state === "processing" && (
              <span>Before: {file.beforeTags} &nbsp;After: <span style={{ animation: "pulse 1s ease-in-out infinite" }}>...</span></span>
            )}
            {state === "complete" && `Before: ${file.beforeTags}  After: ${file.afterTags}`}
            {state === "error" && (
              <span>Before: — &nbsp;<span style={{ color: t.error }}>Error: {file.error}</span></span>
            )}
          </div>
        </div>

        {/* Detail overlay */}
        {isSelected && (state === "complete" || state === "error") && file.id === 1 && (
          <div data-overlay style={{
            position: "absolute", bottom: "calc(100% + 8px)", left: 0, zIndex: 50,
            background: t.card, border: `1px solid ${t.cardBorder}`, borderRadius: 8,
            boxShadow: "0 4px 20px rgba(0,0,0,0.15)", padding: 16,
            width: 260, maxHeight: 240, overflowY: "auto",
          }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: t.heading, marginBottom: 8 }}>{file.name}</div>
            <div style={{ height: 1, background: t.cardBorder, marginBottom: 10 }} />
            {(showAllTags ? DETAIL_TAGS : DETAIL_TAGS.slice(0, 6)).map(([key, val], i) => (
              <div key={i} style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 4, color: t.body }}>
                <span style={{ color: t.secondary }}>{key}</span>
                <span style={{ fontWeight: 500 }}>{val}</span>
              </div>
            ))}
            {!showAllTags && DETAIL_TAGS.length > 6 && (
              <button onClick={(e) => { e.stopPropagation(); setShowAllTags(true); }}
                style={{ fontSize: 12, color: t.info, background: "none", border: "none", cursor: "pointer", padding: 0, marginTop: 4 }}>
                ... {DETAIL_TAGS.length - 6} more tags
              </button>
            )}
            <div style={{ marginTop: 10, fontSize: 12, color: t.success, fontWeight: 500, display: "flex", alignItems: "center", gap: 4 }}>
              All {file.beforeTags} tags removed ✓
            </div>
          </div>
        )}

        {/* Simple overlay for non-first cards */}
        {isSelected && (state === "complete" || state === "error") && file.id !== 1 && (
          <div data-overlay style={{
            position: "absolute", bottom: "calc(100% + 8px)", left: 0, zIndex: 50,
            background: t.card, border: `1px solid ${t.cardBorder}`, borderRadius: 8,
            boxShadow: "0 4px 20px rgba(0,0,0,0.15)", padding: 16, width: 220,
          }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: t.heading, marginBottom: 8 }}>{file.name}</div>
            <div style={{ height: 1, background: t.cardBorder, marginBottom: 10 }} />
            {state === "complete" ? (
              <div style={{ fontSize: 12, color: t.success, fontWeight: 500 }}>
                All {file.beforeTags} tags removed ✓
              </div>
            ) : (
              <div style={{ fontSize: 12, color: t.error, fontWeight: 500 }}>
                Error: {file.error}
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <div style={{
      width: 580, height: 400, margin: "40px auto", borderRadius: 10,
      overflow: "hidden", display: "flex", flexDirection: "column",
      background: t.bg, fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      border: `1px solid ${t.cardBorder}`, position: "relative",
      boxShadow: "0 8px 32px rgba(0,0,0,0.12)",
    }}>
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes popIn { 0% { transform: scale(0); opacity: 0; } 50% { transform: scale(1.3); } 100% { transform: scale(1); opacity: 1; } }
        @keyframes pulse { 0%, 100% { opacity: 0.4; } 50% { opacity: 1; } }
        @keyframes fadeSlideIn { from { opacity: 0; transform: translateX(20px); } to { opacity: 1; transform: translateX(0); } }
      `}</style>

      {/* Title bar */}
      <div style={{
        height: 38, background: t.chrome, borderBottom: `1px solid ${t.cardBorder}`,
        display: "flex", alignItems: "center", padding: "0 12px", flexShrink: 0,
        justifyContent: "space-between",
      }}>
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <span style={{ width: 10, height: 10, borderRadius: "50%", background: "#FF5F57" }} />
          <span style={{ width: 10, height: 10, borderRadius: "50%", background: "#FEBC2E" }} />
          <span style={{ width: 10, height: 10, borderRadius: "50%", background: "#28C840" }} />
        </div>
        <span style={{ fontSize: 13, fontWeight: 500, color: t.heading, letterSpacing: 0.2 }}>ExifCleaner</span>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <button onClick={() => setSettingsOpen(!settingsOpen)} style={{
            background: "none", border: "none", cursor: "pointer", fontSize: 16,
            color: settingsOpen ? t.burgundy : t.secondary, padding: 2,
            transition: "color 150ms",
          }} title="Settings">⚙</button>
          <button onClick={() => setTheme(theme === "light" ? "dark" : "light")} style={{
            background: "none", border: "none", cursor: "pointer", fontSize: 14,
            color: t.secondary, padding: 2,
          }} title="Toggle theme">{theme === "light" ? "☽" : "☀"}</button>
        </div>
      </div>

      {/* Main content area */}
      <div style={{ flex: 1, display: "flex", overflow: "hidden", position: "relative" }}>
        {/* Card area */}
        <div ref={cardAreaRef} style={{
          flex: 1, padding: 16, overflow: "auto", display: "flex", flexDirection: "column",
          transition: "all 200ms ease-out",
        }}>
          {/* Empty / Drop zone state */}
          {(appState === "empty" || appState === "dragover") && (
            <div
              onDragOver={(e) => { e.preventDefault(); setAppState("dragover"); }}
              onDragLeave={() => setAppState("empty")}
              onDrop={(e) => { e.preventDefault(); startProcessing(); }}
              style={{
                flex: 1, display: "flex", flexDirection: "column", alignItems: "center",
                justifyContent: "center", gap: 12,
                border: appState === "dragover" ? `2px dashed ${t.gold}` : `2px dashed ${t.cardBorder}`,
                borderRadius: 12,
                background: appState === "dragover" ? `${t.gold}0D` : "transparent",
                transition: "all 150ms ease-out",
              }}
            >
              {appState === "dragover" ? (
                <span style={{ fontSize: 16, fontWeight: 600, color: t.gold }}>Release to clean</span>
              ) : (
                <>
                  <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke={t.muted} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="3" width="18" height="18" rx="2" />
                    <circle cx="8.5" cy="8.5" r="1.5" />
                    <path d="M21 15l-5-5L5 21" />
                  </svg>
                  <div style={{ textAlign: "center" }}>
                    <div style={{ fontSize: 16, color: t.body, fontWeight: 400 }}>Drop files here to</div>
                    <div style={{ fontSize: 16, color: t.body, fontWeight: 400 }}>remove metadata</div>
                  </div>
                  <button onClick={startProcessing} style={{
                    marginTop: 4, padding: "8px 20px", borderRadius: 6,
                    background: t.burgundy, color: "#fff", border: "none",
                    fontSize: 14, fontWeight: 500, cursor: "pointer",
                    transition: "opacity 150ms",
                  }}
                    onMouseEnter={(e) => e.currentTarget.style.opacity = "0.85"}
                    onMouseLeave={(e) => e.currentTarget.style.opacity = "1"}
                  >
                    Add files
                  </button>
                </>
              )}
            </div>
          )}

          {/* Card grid */}
          {(appState === "processing" || appState === "complete") && (
            <div style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))",
              gap: 12, flex: 1, alignContent: "start",
            }}>
              {files.map((file, i) => (
                <Card key={file.id} file={file} index={i} />
              ))}
            </div>
          )}

          {/* Clear button */}
          {showClear && !clearing && (
            <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 8, animation: "fadeSlideIn 200ms ease-out" }}>
              <button onClick={handleClear} style={{
                background: "none", border: `1px solid ${t.cardBorder}`, borderRadius: 6,
                padding: "6px 14px", fontSize: 13, color: t.secondary, cursor: "pointer",
                display: "flex", alignItems: "center", gap: 6, transition: "all 150ms",
              }}
                onMouseEnter={(e) => { e.currentTarget.style.background = t.card; e.currentTarget.style.borderColor = t.muted; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = "none"; e.currentTarget.style.borderColor = t.cardBorder; }}
              >
                Clear
                <span style={{ fontSize: 11, color: t.muted, background: t.badgeBg, padding: "1px 5px", borderRadius: 4, fontWeight: 500 }}>⌘K</span>
              </button>
            </div>
          )}
        </div>

        {/* Settings panel */}
        <div style={{
          width: settingsOpen ? 200 : 0, overflow: "hidden", flexShrink: 0,
          borderLeft: settingsOpen ? `1px solid ${t.cardBorder}` : "none",
          background: t.card,
          transition: "width 200ms ease-out",
        }}>
          <div style={{ width: 200, padding: 16 }}>
            <div style={{ fontSize: 15, fontWeight: 600, color: t.heading, marginBottom: 16 }}>Settings</div>
            {[
              { key: "preserveOrientation", label: "Preserve orientation" },
              { key: "keepOriginals", label: "Keep originals" },
              { key: "preserveFileDates", label: "Preserve file dates" },
            ].map((s) => (
              <label key={s.key} style={{
                display: "flex", alignItems: "flex-start", gap: 8, marginBottom: 14,
                cursor: "pointer", fontSize: 14, color: t.body, lineHeight: 1.4,
              }}>
                <input
                  type="checkbox"
                  checked={settings[s.key]}
                  onChange={() => setSettings(prev => ({ ...prev, [s.key]: !prev[s.key] }))}
                  style={{ marginTop: 2, accentColor: t.burgundy, cursor: "pointer" }}
                />
                {s.label}
              </label>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
