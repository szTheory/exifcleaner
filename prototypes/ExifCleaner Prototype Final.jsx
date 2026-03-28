import { useState, useEffect, useRef, useCallback } from "react";

// ─── Theme Palettes ───────────────────────────────────────────────
const lightTheme = {
  background: "#F5F6F8", surface: "#FFFFFF", alternateRow: "#F7F8F9",
  hoverRow: "#EEF0F3", borders: "#DADEE4", bodyText: "#3B4351",
  headingText: "#1E2028", mutedText: "#9BA3B0", secondaryText: "#66758C",
  windowChrome: "#FAFAFA", brandBurgundy: "#521737", brandGold: "#F8D057",
  brandOrange: "#E97043", success: "#2D8659", successBg: "#E8F5EE",
  error: "#C44536", errorBg: "#FCEAE8", badgeBg: "#EEF0F3",
  folderRowBg: "#EEF0F3", backdropColor: "rgba(0,0,0,0.2)",
  tooltipBg: "#1E2028", tooltipText: "#FFFFFF",
};

const darkTheme = {
  background: "#141416", surface: "#1C1C1F", alternateRow: "#1A1A1D",
  hoverRow: "#252528", borders: "#48484D", bodyText: "#C5C5CB",
  headingText: "#EEEEF0", mutedText: "#818188", secondaryText: "#9B9BA3",
  windowChrome: "#0E0E10", brandBurgundy: "#C4467A", brandGold: "#F8D057",
  brandOrange: "#E97043", success: "#4CA87A", successBg: "#1A3D2B",
  error: "#D4675A", errorBg: "#3D1A16", badgeBg: "#252528",
  folderRowBg: "#1E1E21", backdropColor: "rgba(0,0,0,0.4)",
  tooltipBg: "#3a3a3f", tooltipText: "#EEEEF0",
};

const FONT = 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';
const FONT_MONO = 'ui-monospace, "SF Mono", "Cascadia Code", Menlo, Consolas, monospace';

// ─── Demo Data ────────────────────────────────────────────────────
const generateFiles = () => [
  { name: "vacation_photo.jpg", ext: "JPG", size: "3.8 MB", folder: null, beforeTags: 23, afterTags: 0, status: "pending", error: null, isFolder: false },
  { name: "selfie_park.heic", ext: "HEIC", size: "2.4 MB", folder: null, beforeTags: 45, afterTags: 0, status: "pending", error: null, isFolder: false },
  { name: "portrait.png", ext: "PNG", size: "1.1 MB", folder: null, beforeTags: 8, afterTags: 0, status: "pending", error: null, isFolder: false },
  { name: "scan_receipt.pdf", ext: "PDF", size: "340 KB", folder: null, beforeTags: 12, afterTags: 0, status: "pending", error: null, isFolder: false },
  { name: "corrupt_file.pdf", ext: "PDF", size: "28 KB", folder: null, beforeTags: null, afterTags: null, status: "pending", error: "Can't read file", isFolder: false },
  { name: "Camera Roll/", folder: "Camera Roll/", isFolder: true, fileCount: "2 folders, 11 files" },
  { name: "IMG_2847.mov", ext: "MOV", size: "42 MB", folder: "Camera Roll/", beforeTags: 67, afterTags: 0, status: "pending", error: null, isFolder: false },
  { name: "IMG_2850.jpg", ext: "JPG", size: "4.2 MB", folder: "Camera Roll/", beforeTags: 38, afterTags: 0, status: "pending", error: null, isFolder: false },
  { name: "Camera Roll/Beach Day/", folder: "Camera Roll/Beach Day/", isFolder: true, fileCount: "3 files" },
  { name: "ocean_sunset.jpg", ext: "JPG", size: "5.1 MB", folder: "Camera Roll/Beach Day/", beforeTags: 41, afterTags: 0, status: "pending", error: null, isFolder: false },
  { name: "sandy_feet.heic", ext: "HEIC", size: "3.3 MB", folder: "Camera Roll/Beach Day/", beforeTags: 29, afterTags: 0, status: "pending", error: null, isFolder: false },
  { name: "video_waves.mp4", ext: "MP4", size: "18 MB", folder: "Camera Roll/Beach Day/", beforeTags: 52, afterTags: 0, status: "pending", error: null, isFolder: false },
  { name: "Camera Roll/City Walk/", folder: "Camera Roll/City Walk/", isFolder: true, fileCount: "4 files" },
  { name: "street_art.jpg", ext: "JPG", size: "2.9 MB", folder: "Camera Roll/City Walk/", beforeTags: 35, afterTags: 0, status: "pending", error: null, isFolder: false },
  { name: "cafe_latte.heic", ext: "HEIC", size: "1.8 MB", folder: "Camera Roll/City Walk/", beforeTags: 22, afterTags: 0, status: "pending", error: null, isFolder: false },
  { name: "night_lights.jpg", ext: "JPG", size: "4.5 MB", folder: "Camera Roll/City Walk/", beforeTags: 44, afterTags: 0, status: "pending", error: null, isFolder: false },
  { name: "broken_raw.dng", ext: "DNG", size: "22 MB", folder: "Camera Roll/City Walk/", beforeTags: null, afterTags: null, status: "pending", error: "Format not supported", isFolder: false },
  { name: "Camera Roll/Portraits/", folder: "Camera Roll/Portraits/", isFolder: true, fileCount: "1 file" },
  { name: "headshot_final.jpg", ext: "JPG", size: "3.6 MB", folder: "Camera Roll/Portraits/", beforeTags: 31, afterTags: 0, status: "pending", error: null, isFolder: false },
];

const vacationPhotoTags = [
  { name: "GPSLatitude", value: "37.7749", removed: true },
  { name: "GPSLongitude", value: "-122.4194", removed: true },
  { name: "Make", value: "Apple", removed: true },
  { name: "Model", value: "iPhone 15 Pro", removed: true },
  { name: "DateTime", value: "2025:01:15 14:23:07", removed: true },
  { name: "Software", value: "17.2", removed: true },
  { name: "ExposureTime", value: "1/120", removed: true },
  { name: "FNumber", value: "1.78", removed: true },
  { name: "ISO", value: "50", removed: true },
  { name: "FocalLength", value: "6.86mm", removed: true },
  { name: "ShutterSpeed", value: "1/120", removed: true },
  { name: "Aperture", value: "1.78", removed: true },
  { name: "BrightnessValue", value: "8.2", removed: true },
  { name: "WhiteBalance", value: "Auto", removed: true },
  { name: "Flash", value: "Off", removed: true },
  { name: "LensModel", value: "iPhone 15 Pro back camera", removed: true },
  { name: "ImageWidth", value: "4032", removed: true },
  { name: "ImageHeight", value: "3024", removed: true },
  { name: "XResolution", value: "72", removed: true },
  { name: "YResolution", value: "72", removed: true },
  { name: "CreateDate", value: "2025:01:15", removed: true },
  { name: "Orientation", value: "Horizontal (normal)", removed: false },
  { name: "ColorSpace", value: "sRGB", removed: false },
];

function generateGenericTags(count) {
  const pool = [
    { name: "GPSLatitude", value: "42.3601" }, { name: "GPSLongitude", value: "-71.0589" },
    { name: "Make", value: "Apple" }, { name: "Model", value: "iPhone 16 Pro" },
    { name: "DateTime", value: "2025:03:10 09:14:22" }, { name: "Software", value: "18.1" },
    { name: "ExposureTime", value: "1/250" }, { name: "FNumber", value: "2.8" },
    { name: "ISO", value: "100" }, { name: "FocalLength", value: "6.86mm" },
    { name: "ShutterSpeed", value: "1/250" }, { name: "Aperture", value: "2.8" },
    { name: "BrightnessValue", value: "7.4" }, { name: "WhiteBalance", value: "Auto" },
    { name: "Flash", value: "Off" }, { name: "LensModel", value: "Main Camera" },
    { name: "ImageWidth", value: "4032" }, { name: "ImageHeight", value: "3024" },
    { name: "XResolution", value: "72" }, { name: "YResolution", value: "72" },
    { name: "CreateDate", value: "2025:03:10" }, { name: "ColorSpace", value: "sRGB" },
    { name: "Orientation", value: "Horizontal" },
  ];
  const tags = [];
  for (let i = 0; i < Math.min(count, pool.length); i++) {
    tags.push({ ...pool[i], removed: i < count - 2 });
  }
  return tags;
}

// ─── Main Component ───────────────────────────────────────────────
export default function ExifCleanerPrototype() {
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [appState, setAppState] = useState("empty");
  const [files, setFiles] = useState([]);
  const [expandedRowIndex, setExpandedRowIndex] = useState(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settings, setSettings] = useState({ preserveOrientation: true, keepOriginals: false, preserveDates: false });
  const [toastMessage, setToastMessage] = useState(null);
  const [progress, setProgress] = useState(0);
  const [progressFlash, setProgressFlash] = useState(false);
  const [rowsVisible, setRowsVisible] = useState(0);
  const [hoveredRow, setHoveredRow] = useState(null);
  const [collapsedFolders, setCollapsedFolders] = useState(new Set());
  const [processingDuration, setProcessingDuration] = useState(null);

  const animatedChecks = useRef(new Set());
  const timersRef = useRef([]);
  const toastTimerRef = useRef(null);
  const processingStartRef = useRef(null);

  const th = isDarkMode ? darkTheme : lightTheme;

  // Derived counts
  const fileRows = files.filter((f) => !f.isFolder);
  const totalFiles = fileRows.length;
  const completedFiles = fileRows.filter((f) => f.status === "complete" || f.status === "error").length;
  const cleanedCount = fileRows.filter((f) => f.status === "complete").length;
  const errorCount = fileRows.filter((f) => f.status === "error").length;
  const totalTagsRemoved = fileRows.reduce((s, f) => s + (f.status === "complete" ? f.beforeTags || 0 : 0), 0);

  const showToast = useCallback((msg) => {
    setToastMessage(msg);
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => setToastMessage(null), 2000);
  }, []);

  const clearTimers = useCallback(() => {
    timersRef.current.forEach(clearTimeout);
    timersRef.current = [];
  }, []);

  const startDemo = useCallback(() => {
    clearTimers();
    animatedChecks.current = new Set();
    const fresh = generateFiles();
    setFiles(fresh);
    setAppState("processing");
    setExpandedRowIndex(null);
    setProgress(0);
    setProgressFlash(false);
    setRowsVisible(0);
    setHoveredRow(null);
    setCollapsedFolders(new Set());
    setProcessingDuration(null);
    processingStartRef.current = Date.now();

    const t_ = (fn, ms) => { const id = setTimeout(fn, ms); timersRef.current.push(id); };

    fresh.forEach((_, i) => {
      t_(() => setRowsVisible((v) => Math.max(v, i + 1)), 100 + i * 30);
    });

    const fileIndices = [];
    fresh.forEach((f, i) => { if (!f.isFolder) fileIndices.push(i); });

    const processStart = 700;
    let delay = 0;

    fileIndices.forEach((fileIdx, seqIdx) => {
      const startTime = processStart + delay;
      const file = fresh[fileIdx];
      const duration = file.error ? 300 : 200;

      t_(() => {
        setFiles((prev) => { const n = [...prev]; n[fileIdx] = { ...n[fileIdx], status: "processing" }; return n; });
        setProgress((seqIdx / fileIndices.length) * 100);
      }, startTime);

      t_(() => {
        const finalStatus = file.error ? "error" : "complete";
        if (finalStatus === "complete") animatedChecks.current.add(fileIdx);
        setFiles((prev) => { const n = [...prev]; n[fileIdx] = { ...n[fileIdx], status: finalStatus }; return n; });
        setProgress(((seqIdx + 1) / fileIndices.length) * 100);
      }, startTime + duration);

      delay += duration + 100;
    });

    const completeTime = processStart + delay + 100;
    t_(() => {
      setAppState("complete");
      setProgressFlash(true);
      setProcessingDuration(((Date.now() - processingStartRef.current) / 1000).toFixed(1));
      t_(() => setProgressFlash(false), 600);
    }, completeTime);


  }, [clearTimers]);

  const handleCleanMore = useCallback(() => {
    clearTimers();
    animatedChecks.current = new Set();
    setAppState("empty");
    setFiles([]);
    setExpandedRowIndex(null);
    setProgress(0);
    setProgressFlash(false);
    setRowsVisible(0);
    setHoveredRow(null);
    setCollapsedFolders(new Set());
    setProcessingDuration(null);
  }, [clearTimers]);

  useEffect(() => () => clearTimers(), [clearTimers]);

  const handleRowClick = (index) => {
    const file = files[index];
    if (file.isFolder || (file.status !== "complete" && file.status !== "error")) return;
    setExpandedRowIndex(expandedRowIndex === index ? null : index);
  };

  // ─── Render helpers (plain functions, NOT components) ─────────

  const renderStatusIcon = (status, fileIdx) => {
    if (status === "pending") return <span style={{ color: th.mutedText, fontSize: 10, lineHeight: 1 }}>●</span>;
    if (status === "processing") return (
      <svg width="14" height="14" viewBox="0 0 16 16" style={{ animation: "exifSpin 1s linear infinite", display: "block" }}>
        <circle cx="8" cy="8" r="6" fill="none" stroke={th.brandGold} strokeWidth="2"
          strokeDasharray="28" strokeDashoffset="8" strokeLinecap="round" />
      </svg>
    );
    if (status === "complete") {
      const shouldPop = animatedChecks.current.has(fileIdx);
      if (shouldPop) animatedChecks.current.delete(fileIdx);
      return (
        <span style={{
          color: th.success, fontSize: 14, fontWeight: 700, display: "inline-block", lineHeight: 1,
          animation: shouldPop ? "exifCheckPop 300ms cubic-bezier(0.34,1.56,0.64,1.0) forwards" : "none",
        }}>✓</span>
      );
    }
    if (status === "error") return (
      <span style={{ color: th.error, fontSize: 13, lineHeight: 1, display: "inline-flex", alignItems: "center" }}>
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
          <circle cx="8" cy="8" r="7" stroke={th.error} strokeWidth="1.5" />
          <line x1="5.5" y1="5.5" x2="10.5" y2="10.5" stroke={th.error} strokeWidth="1.5" strokeLinecap="round" />
          <line x1="10.5" y1="5.5" x2="5.5" y2="10.5" stroke={th.error} strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      </span>
    );
    return null;
  };

  const renderExpansion = (file) => {
    if (file.error) {
      const errorMsg = file.error === "Can't read file"
        ? "ExifTool could not read this file. The file may be corrupted or in an unsupported format."
        : `Error: ${file.error}`;
      const copyError = (e) => {
        e.stopPropagation();
        navigator.clipboard.writeText(errorMsg).then(() => showToast("Copied to clipboard"));
      };
      return (
        <div style={{
          backgroundColor: th.surface, borderTop: `1px solid ${th.borders}`,
          borderBottom: `1px solid ${th.borders}`, padding: "12px 16px",
        }}>
          <div onClick={copyError} style={{
            fontSize: 13, color: th.error, lineHeight: 1.5, cursor: "copy",
            padding: "4px 8px", borderRadius: 4, display: "inline-block",
            transition: "background-color 100ms ease-out",
          }}
            onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = th.errorBg)}
            onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "transparent")}
          >{errorMsg}</div>
        </div>
      );
    }
    const tags = file.name === "vacation_photo.jpg" ? vacationPhotoTags : generateGenericTags(file.beforeTags || 10);
    const removed = tags.filter((tg) => tg.removed).length;
    const preserved = tags.length - removed;
    return (
      <div style={{
        backgroundColor: th.surface, borderTop: `1px solid ${th.borders}`,
        borderBottom: `1px solid ${th.borders}`, padding: "12px 16px",
        maxHeight: 200, overflowY: "auto", userSelect: "text",
      }}>
        {/* Expansion header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10, flexWrap: "wrap", gap: 4 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, flexWrap: "wrap" }}>
            <span style={{ fontSize: 14, fontWeight: 500, color: th.bodyText }}>{file.name}</span>
            <span style={{ color: th.mutedText }}>{file.size}</span>
            <span style={{ color: th.mutedText }}>·</span>
            <span style={{ color: th.mutedText }}>{tags.length} tags examined</span>
            <span style={{ color: th.mutedText }}>·</span>
            <span style={{ color: th.error }}>{removed} removed</span>
            <span style={{ color: th.mutedText }}>·</span>
            <span style={{ color: th.success }}>{preserved} preserved</span>
          </div>
          <button onClick={(e) => { e.stopPropagation(); showToast("Revealed in Finder"); }} style={{
            background: "none", border: "none", cursor: "pointer", color: th.brandBurgundy, fontSize: 12, fontFamily: FONT, padding: 0,
          }}>Reveal in Finder →</button>
        </div>
        {/* Tag list — no pills, just color + strikethrough */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "3px 20px" }}>
          {tags.map((tag, i) => (
            <div key={i} style={{
              fontFamily: FONT_MONO, fontSize: 12, padding: "2px 0", lineHeight: 1.4,
              overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
              color: tag.removed ? th.error : th.success,
              textDecoration: tag.removed ? "line-through" : "none",
              opacity: tag.removed ? 0.7 : 1,
            }}>
              {tag.name}: {tag.value}
            </div>
          ))}
        </div>
      </div>
    );
  };

  const getRowBg = (file, index, hovered) => {
    if (file.status === "error") return th.errorBg;
    const isClickable = file.status === "complete" || file.status === "error";
    if (hovered && isClickable) return th.hoverRow;
    let count = 0;
    for (let j = 0; j < index; j++) { if (!files[j].isFolder) count++; }
    return count % 2 === 1 ? th.alternateRow : th.surface;
  };

  // ─── Type pill colors (subtle, scannable) ────────────────────
  const typePillColors = {
    JPG:  { light: { bg: "#E3F0FF", text: "#2B6CB0" }, dark: { bg: "#1A2A3D", text: "#63B3ED" } },
    HEIC: { light: { bg: "#E9E3FF", text: "#5B3FC5" }, dark: { bg: "#251F3D", text: "#A78BFA" } },
    PNG:  { light: { bg: "#DFFCE8", text: "#276749" }, dark: { bg: "#1A3D2B", text: "#68D391" } },
    PDF:  { light: { bg: "#FFE4E1", text: "#C44536" }, dark: { bg: "#3D1A16", text: "#FC8181" } },
    MOV:  { light: { bg: "#FFF3DB", text: "#B7791F" }, dark: { bg: "#3D2E14", text: "#F6E05E" } },
    MP4:  { light: { bg: "#FFF3DB", text: "#B7791F" }, dark: { bg: "#3D2E14", text: "#F6E05E" } },
    DNG:  { light: { bg: "#FFE8D6", text: "#C05621" }, dark: { bg: "#3D2214", text: "#F6AD55" } },
  };
  const getTypePillStyle = (ext) => {
    const colors = typePillColors[ext];
    if (!colors) return { bg: th.badgeBg, text: th.mutedText };
    return isDarkMode ? { bg: colors.dark.bg, text: colors.dark.text } : { bg: colors.light.bg, text: colors.light.text };
  };

  // ─── Folder collapse toggle ───────────────────────────────────
  const toggleFolder = (folderName) => {
    setCollapsedFolders((prev) => {
      const next = new Set(prev);
      if (next.has(folderName)) next.delete(folderName);
      else next.add(folderName);
      return next;
    });
  };

  // Helper: is this row hidden by a collapsed parent folder?
  const isFileHidden = (file) => {
    if (!file.folder) return false;
    for (const collapsed of collapsedFolders) {
      if (file.isFolder) {
        // Hide sub-folder rows whose path starts with (but isn't equal to) a collapsed folder
        if (file.folder.startsWith(collapsed) && file.folder !== collapsed) return true;
      } else {
        // Hide file rows under any collapsed folder
        if (file.folder.startsWith(collapsed)) return true;
      }
    }
    return false;
  };

  const settingItems = [
    { key: "preserveOrientation", label: "Preserve orientation", desc: "Keep rotation metadata so images display correctly" },
    { key: "keepOriginals", label: "Keep original files", desc: "Save cleaned copies as filename_clean.ext" },
    { key: "preserveDates", label: "Preserve file dates", desc: "Keep original creation and modification times" },
  ];

  const isEmptyOrDrag = appState === "empty" || appState === "dragOver";
  const isOver = appState === "dragOver";
  const showStatusBar = !isEmptyOrDrag;

  return (
    <div style={{ display: "flex", justifyContent: "center", alignItems: "center", minHeight: "100vh", background: isDarkMode ? "#0a0a0b" : "#E8E9EC", padding: 20 }}>
      <style>{`
        @keyframes exifSpin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        @keyframes exifCheckPop { 0% { transform: scale(0); } 70% { transform: scale(1.15); } 100% { transform: scale(1); } }
        @keyframes exifPulse { 0%, 100% { opacity: 0.4; } 50% { opacity: 1; } }
        @keyframes exifSlideIn { from { transform: translateX(280px); } to { transform: translateX(0); } }
        @keyframes exifFadeIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes exifFlash { 0% { opacity: 1; } 50% { opacity: 1; } 100% { opacity: 0; } }
        @media (prefers-reduced-motion: reduce) {
          *, *::before, *::after { animation-duration: 0.01ms !important; transition-duration: 0.01ms !important; }
        }
      `}</style>

      <div style={{
        width: 700, height: 500, borderRadius: 10, overflow: "hidden",
        backgroundColor: th.background, color: th.bodyText, fontFamily: FONT,
        display: "flex", flexDirection: "column", position: "relative",
        boxShadow: isDarkMode ? "0 8px 32px rgba(0,0,0,0.5)" : "0 8px 32px rgba(0,0,0,0.16)",
        border: `1px solid ${th.borders}`, transition: "background-color 200ms ease-out, color 200ms ease-out",
        userSelect: "none",
      }}>

        {/* ═══ TITLE BAR ═══ */}
        <div style={{
          height: 38, backgroundColor: th.windowChrome, borderBottom: `1px solid ${th.borders}`,
          display: "flex", alignItems: "center", padding: "0 12px", flexShrink: 0,
          transition: "background-color 200ms ease-out",
        }}>
          <div style={{ display: "flex", gap: 8 }}>
            {["#FF5F57", "#FFBD2E", "#27C93F"].map((c) => (
              <div key={c} style={{ width: 12, height: 12, borderRadius: "50%", backgroundColor: c }} />
            ))}
          </div>
          <div style={{ flex: 1, textAlign: "center", fontSize: 13, color: th.mutedText, fontWeight: 400 }}>ExifCleaner</div>
          <button onClick={() => setSettingsOpen(true)} style={{
            background: "none", border: "none", cursor: "pointer", fontSize: 16,
            color: th.mutedText, padding: "0 4px", lineHeight: 1,
          }}>⚙</button>
          <button onClick={() => setIsDarkMode((d) => !d)} style={{
            background: "none", border: "none", cursor: "pointer", fontSize: 16,
            color: th.mutedText, padding: "0 4px", marginLeft: 4, lineHeight: 1,
          }}>{isDarkMode ? "☽" : "☀"}</button>
        </div>

        {/* ═══ MAIN CONTENT ═══ */}
        {isEmptyOrDrag ? (
          <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: 32 }}>
            <div style={{
              border: `2px dashed ${isOver ? th.brandGold : th.borders}`,
              borderRadius: 8, padding: "48px 32px", textAlign: "center",
              width: "100%", maxWidth: 420,
              backgroundColor: isOver ? (isDarkMode ? "rgba(248,208,87,0.06)" : "rgba(248,208,87,0.05)") : "transparent",
              transition: "all 150ms ease-out",
              display: "flex", flexDirection: "column", alignItems: "center",
            }}>
              {isOver ? (
                <div style={{ fontSize: 16, fontWeight: 500, color: th.brandGold }}>Release to clean</div>
              ) : (
                <>
                  <div style={{ marginBottom: 12 }}>
                    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke={th.mutedText} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                      <polyline points="14 2 14 8 20 8" />
                      <line x1="12" y1="18" x2="12" y2="12" />
                      <line x1="9" y1="15" x2="15" y2="15" />
                    </svg>
                  </div>
                  <div style={{ fontSize: 16, color: th.bodyText, marginBottom: 4 }}>Drop images, videos, or PDFs</div>
                  <div style={{ fontSize: 14, color: th.mutedText, marginBottom: 16 }}>to remove metadata</div>
                  <button onClick={startDemo} style={{
                    background: "none", border: "none", cursor: "pointer",
                    color: th.brandBurgundy, fontSize: 14, fontWeight: 500, padding: 0,
                    textDecoration: "none", fontFamily: FONT,
                  }}
                    onMouseEnter={(e) => (e.target.style.textDecoration = "underline")}
                    onMouseLeave={(e) => (e.target.style.textDecoration = "none")}
                  >Add files</button>
                </>
              )}
            </div>
          </div>
        ) : (
          <div style={{ flex: 1, overflow: "hidden", display: "flex", flexDirection: "column" }}>
            {/* ─── Table Header ─── */}
            <div style={{
              display: "flex", alignItems: "center", height: 36, padding: "0 12px",
              backgroundColor: th.background, borderBottom: `2px solid ${th.borders}`,
              fontSize: 14, fontWeight: 600, color: th.secondaryText, letterSpacing: "0.5px",
              textTransform: "uppercase", flexShrink: 0, transition: "background-color 200ms ease-out",
            }}>
              <div style={{ flex: 1, paddingLeft: 24 }}>NAME</div>
              <div style={{ width: 56, textAlign: "left" }}>TYPE</div>
              <div style={{ width: 64, textAlign: "left" }}>SIZE</div>
              <div style={{ width: 56, textAlign: "left" }}>BEFORE</div>
              <div style={{ width: 52, textAlign: "left", paddingRight: 4 }}>AFTER</div>
            </div>

            {/* ─── Table Body ─── */}
            <div style={{ flex: 1, overflowY: "auto" }}>
              {files.map((file, i) => {
                if (i >= rowsVisible) return null;
                if (isFileHidden(file)) return null;

                // ── Folder header row (collapsible) ──
                if (file.isFolder) {
                  const isCollapsed = collapsedFolders.has(file.folder);
                  return (
                    <div key={i} onClick={() => toggleFolder(file.folder)} style={{
                      display: "flex", alignItems: "center", height: 36, padding: "0 12px",
                      backgroundColor: th.folderRowBg, fontSize: 13, color: th.secondaryText, fontWeight: 500,
                      transition: "background-color 200ms ease-out", cursor: "pointer",
                    }}>
                      <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 5 }}>
                        <span style={{ fontSize: 10, lineHeight: 1, width: 12, textAlign: "center", color: th.mutedText, transition: "transform 150ms ease-out", display: "inline-block", transform: isCollapsed ? "rotate(-90deg)" : "rotate(0deg)" }}>▾</span>
                        <span style={{ fontSize: 13, lineHeight: 1 }}>📁</span>
                        <span>{file.name}</span>
                      </div>
                      <div style={{ fontSize: 11, color: th.mutedText }}>{file.fileCount}</div>
                    </div>
                  );
                }

                // ── File row ──
                const isClickable = file.status === "complete" || file.status === "error";
                const isHovered = hoveredRow === i;
                const showReveal = isHovered && file.status === "complete";
                const showErrorTooltip = isHovered && file.status === "error";

                return (
                  <div key={i}>
                    <div
                      onClick={() => handleRowClick(i)}
                      onMouseEnter={() => setHoveredRow(i)}
                      onMouseLeave={() => setHoveredRow(null)}
                      style={{
                        display: "flex", alignItems: "center", height: 40, padding: "0 12px",
                        backgroundColor: getRowBg(file, i, isHovered),
                        cursor: isClickable ? "pointer" : "default",
                        transition: "background-color 100ms ease-out",
                        position: "relative",
                      }}
                    >
                      {/* Name cell */}
                      <div style={{
                        flex: 1, display: "flex", alignItems: "center", gap: 6, minWidth: 0,
                        paddingLeft: file.folder != null ? 20 : 0,
                      }}>
                        <span style={{ width: 16, display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                          {renderStatusIcon(file.status, i)}
                        </span>
                        <span style={{
                          fontSize: 15, color: th.bodyText, overflow: "hidden",
                          textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1,
                        }}>{file.name}</span>
                        {/* ↗ reveal — always in DOM, opacity toggled */}
                        <span
                          onClick={(e) => { e.stopPropagation(); showToast("Revealed in Finder"); }}
                          style={{
                            fontSize: 14, color: th.mutedText, flexShrink: 0, paddingRight: 4,
                            opacity: showReveal ? 1 : 0, pointerEvents: showReveal ? "auto" : "none",
                            cursor: "pointer", transition: "opacity 100ms ease-out",
                          }}
                        >↗</span>
                      </div>
                      {/* Type */}
                      <div style={{ width: 56, textAlign: "left" }}>
                        <span style={{
                          fontSize: 11, fontWeight: 600, textTransform: "uppercase",
                          color: getTypePillStyle(file.ext).text,
                          backgroundColor: getTypePillStyle(file.ext).bg,
                          padding: "2px 6px", borderRadius: 9999, display: "inline-block",
                        }}>{file.ext}</span>
                      </div>
                      {/* Size */}
                      <div style={{ width: 64, textAlign: "left", fontSize: 13, color: th.secondaryText }}>
                        {file.size}
                      </div>
                      {/* Before */}
                      <div style={{ width: 56, textAlign: "left", fontSize: 13, fontWeight: 500, color: th.bodyText, fontVariantNumeric: "tabular-nums" }}>
                        {file.status === "pending" ? "—" : (file.beforeTags != null ? file.beforeTags : "—")}
                      </div>
                      {/* After */}
                      <div style={{
                        width: 52, textAlign: "left", fontSize: 13, fontWeight: 500,
                        fontVariantNumeric: "tabular-nums", paddingRight: 4,
                        color: file.status === "error" ? th.error : (file.status === "complete" ? th.success : th.bodyText),
                      }}>
                        {file.status === "pending" && "—"}
                        {file.status === "processing" && <span style={{ animation: "exifPulse 1.5s ease-in-out infinite" }}>...</span>}
                        {file.status === "complete" && "0"}
                        {file.status === "error" && (
                          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" style={{ display: "inline-block", verticalAlign: "middle" }}>
                            <path d="M8 5v3.5M8 10.5h.007" stroke={th.error} strokeWidth="1.5" strokeLinecap="round" />
                            <circle cx="8" cy="8" r="6.5" stroke={th.error} strokeWidth="1.2" />
                          </svg>
                        )}
                      </div>

                      {/* Error tooltip — positioned above the row */}
                      {showErrorTooltip && (
                        <div style={{
                          position: "absolute", bottom: "100%", left: 24, marginBottom: 4,
                          backgroundColor: th.tooltipBg, color: th.tooltipText,
                          padding: "6px 10px", borderRadius: 4, fontSize: 12, lineHeight: 1.3,
                          boxShadow: "0 2px 8px rgba(0,0,0,0.2)", zIndex: 5,
                          whiteSpace: "nowrap", pointerEvents: "none",
                          animation: "exifFadeIn 100ms ease-out",
                        }}>
                          {file.error}
                          <span style={{ color: th.mutedText, marginLeft: 8, fontSize: 11 }}>click for details</span>
                          {/* Tooltip arrow */}
                          <div style={{
                            position: "absolute", top: "100%", left: 16,
                            width: 0, height: 0,
                            borderLeft: "5px solid transparent", borderRight: "5px solid transparent",
                            borderTop: `5px solid ${th.tooltipBg}`,
                          }} />
                        </div>
                      )}
                    </div>

                    {/* Expansion panel */}
                    {expandedRowIndex === i && renderExpansion(file)}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ═══ STATUS BAR ═══ */}
        {showStatusBar && (
          <div style={{
            height: 36, backgroundColor: th.windowChrome, borderTop: `1px solid ${th.borders}`,
            display: "flex", flexDirection: "column", flexShrink: 0,
            transition: "background-color 200ms ease-out",
          }}>
            <div style={{ height: 3, width: "100%", position: "relative", overflow: "hidden" }}>
              {appState === "processing" && (
                <div style={{ height: "100%", width: `${progress}%`, backgroundColor: th.brandGold, transition: "width 300ms ease-out" }} />
              )}
              {progressFlash && (
                <div style={{ position: "absolute", top: 0, left: 0, height: "100%", width: "100%", backgroundColor: th.success, animation: "exifFlash 600ms ease-out forwards" }} />
              )}
            </div>
            <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 12px", fontSize: 13, fontWeight: 400 }}>
              <div>
                {appState === "processing" && (
                  <span style={{ color: th.secondaryText }}>
                    <span style={{ color: th.bodyText, fontWeight: 500 }}>{completedFiles}</span>{" of "}
                    <span style={{ color: th.bodyText, fontWeight: 500 }}>{totalFiles}</span>{" files"}
                  </span>
                )}
                {appState === "complete" && (
                  <span>
                    <span style={{ color: th.success, fontWeight: 500 }}>{cleanedCount} cleaned</span>
                    {errorCount > 0 && (<><span style={{ color: th.mutedText }}> · </span><span style={{ color: th.error, fontWeight: 500 }}>{errorCount} errors</span></>)}
                    <span style={{ color: th.mutedText }}> · </span>
                    <span style={{ color: th.bodyText }}>{totalTagsRemoved} tags removed</span>
                    {processingDuration && (<><span style={{ color: th.mutedText }}> · </span><span style={{ color: th.mutedText }}>{processingDuration}s</span></>)}
                  </span>
                )}
              </div>
              <button onClick={appState === "complete" ? handleCleanMore : undefined} style={{
                background: "none", border: "none", fontFamily: FONT, fontSize: 13, fontWeight: 500, padding: 0,
                color: appState === "complete" ? th.brandBurgundy : th.mutedText,
                cursor: appState === "complete" ? "pointer" : "default", textDecoration: "none",
              }}
                onMouseEnter={(e) => { if (appState === "complete") e.target.style.textDecoration = "underline"; }}
                onMouseLeave={(e) => (e.target.style.textDecoration = "none")}
              >Clean more</button>
            </div>
          </div>
        )}

        {/* ═══ SETTINGS PANEL ═══ */}
        {settingsOpen && (
          <>
            <div onClick={() => setSettingsOpen(false)} style={{
              position: "absolute", top: 38, left: 0, right: 0, bottom: 0,
              backgroundColor: th.backdropColor, zIndex: 10, animation: "exifFadeIn 200ms ease-out forwards",
            }} />
            <div style={{
              position: "absolute", top: 38, right: 0, bottom: isEmptyOrDrag ? 0 : 36,
              width: 280, backgroundColor: th.surface, borderLeft: `1px solid ${th.borders}`,
              boxShadow: isDarkMode ? "-4px 0 16px rgba(0,0,0,0.4)" : "-4px 0 16px rgba(0,0,0,0.12)",
              zIndex: 11, padding: 16, overflowY: "auto",
              animation: "exifSlideIn 200ms ease-out forwards", transition: "background-color 200ms ease-out",
            }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
                <span style={{ fontSize: 18, fontWeight: 500, color: th.headingText }}>Settings</span>
                <button onClick={() => setSettingsOpen(false)} style={{
                  background: "none", border: "none", cursor: "pointer", fontSize: 18, color: th.mutedText, padding: 0, lineHeight: 1,
                }}>✕</button>
              </div>
              {settingItems.map((item) => (
                <div key={item.key} onClick={() => setSettings((s) => ({ ...s, [item.key]: !s[item.key] }))}
                  style={{ display: "flex", gap: 10, marginBottom: 16, cursor: "pointer", alignItems: "flex-start" }}>
                  <div style={{
                    width: 16, height: 16, borderRadius: 3, flexShrink: 0, marginTop: 1,
                    border: settings[item.key] ? "none" : `1.5px solid ${th.borders}`,
                    backgroundColor: settings[item.key] ? th.brandBurgundy : "transparent",
                    display: "flex", alignItems: "center", justifyContent: "center", transition: "all 100ms ease-out",
                  }}>
                    {settings[item.key] && (
                      <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                        <path d="M2 5L4.5 7.5L8 3" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    )}
                  </div>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 500, color: th.bodyText, lineHeight: 1.3 }}>{item.label}</div>
                    <div style={{ fontSize: 12, color: th.mutedText, marginTop: 2, lineHeight: 1.4 }}>{item.desc}</div>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

        {/* ═══ TOAST ═══ */}
        {toastMessage && (
          <div style={{
            position: "absolute", bottom: showStatusBar ? 52 : 16, left: "50%",
            transform: "translateX(-50%)", backgroundColor: isDarkMode ? "#333" : "#1E2028",
            color: "#fff", padding: "8px 16px", borderRadius: 6, fontSize: 13,
            boxShadow: "0 4px 12px rgba(0,0,0,0.2)", zIndex: 20,
            animation: "exifFadeIn 150ms ease-out", pointerEvents: "none",
          }}>{toastMessage}</div>
        )}
      </div>
    </div>
  );
}
