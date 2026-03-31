import { useState, useEffect, useRef, useCallback } from "react";

const FILES_DATA = [
  { id: 1, name: "vacation_photo.jpg", type: "JPG", size: "2.4 MB", before: 23, after: 0, status: "success" },
  { id: 2, name: "selfie_park.heic", type: "HEIC", size: "5.1 MB", before: 45, after: 0, status: "success" },
  { id: 3, name: "portrait.png", type: "PNG", size: "1.2 MB", before: 8, after: 0, status: "success" },
  { id: 4, name: "corrupt_file.pdf", type: "PDF", size: "340 KB", before: null, after: null, status: "error", error: "Can't read file" },
  { id: 5, name: "scan_receipt.pdf", type: "PDF", size: "890 KB", before: 12, after: 0, status: "success" },
  { id: 6, name: "IMG_2847.mov", type: "MOV", size: "48.2 MB", before: 67, after: 0, status: "success" },
];

const METADATA = {
  1: {
    tags: [
      { tag: "Camera Make", before: "Canon", after: null },
      { tag: "Camera Model", before: "EOS R5", after: null },
      { tag: "Lens Model", before: "RF 24-70mm f/2.8", after: null },
      { tag: "Focal Length", before: "35.0 mm", after: null },
      { tag: "F Number", before: "f/2.8", after: null },
      { tag: "Exposure Time", before: "1/250", after: null },
      { tag: "ISO", before: "400", after: null },
      { tag: "GPS Latitude", before: "37.7749° N", after: null },
      { tag: "GPS Longitude", before: "-122.4194° W", after: null },
      { tag: "GPS Altitude", before: "15.2 m", after: null },
      { tag: "Date/Time Original", before: "2025-07-20 09:15:33", after: null },
      { tag: "Create Date", before: "2025-07-20 09:15:33", after: null },
      { tag: "Modify Date", before: "2025-07-21 11:42:00", after: null },
      { tag: "Software", before: "Adobe Lightroom 7.2", after: null },
      { tag: "Creator Tool", before: "Lightroom", after: null },
      { tag: "Image Description", before: "Summer vacation 2025", after: null },
      { tag: "Copyright", before: "Jon Smith", after: null },
      { tag: "Artist", before: "Jon Smith", after: null },
      { tag: "Flash", before: "No Flash", after: null },
      { tag: "White Balance", before: "Auto", after: null },
      { tag: "Metering Mode", before: "Multi-segment", after: null },
      { tag: "Color Space", before: "sRGB", after: "sRGB" },
      { tag: "Orientation", before: "Horizontal (normal)", after: "Horizontal" },
    ],
    examined: 23, removed: 21, preserved: 2,
  },
  2: {
    tags: [
      { tag: "Camera Make", before: "Apple", after: null },
      { tag: "Camera Model", before: "iPhone 15 Pro Max", after: null },
      { tag: "Lens Model", before: "iPhone 15 Pro Max back camera", after: null },
      { tag: "Focal Length", before: "6.765 mm", after: null },
      { tag: "F Number", before: "f/1.78", after: null },
      { tag: "Exposure Time", before: "1/120", after: null },
      { tag: "ISO", before: "64", after: null },
      { tag: "GPS Latitude", before: "40.7580° N", after: null },
      { tag: "GPS Longitude", before: "-73.9855° W", after: null },
      { tag: "GPS Altitude", before: "22.8 m", after: null },
      { tag: "Date/Time Original", before: "2025-08-02 14:22:07", after: null },
      { tag: "Create Date", before: "2025-08-02 14:22:07", after: null },
      { tag: "Modify Date", before: "2025-08-02 14:22:07", after: null },
      { tag: "Software", before: "17.5.1", after: null },
      { tag: "Host Computer", before: "iPhone 15 Pro Max", after: null },
      { tag: "Scene Type", before: "Directly photographed", after: null },
      { tag: "Sensing Method", before: "One-chip color area", after: null },
      { tag: "Exposure Mode", before: "Auto", after: null },
      { tag: "White Balance", before: "Auto", after: null },
      { tag: "Flash", before: "Auto, Did not fire", after: null },
      { tag: "Brightness Value", before: "7.31", after: null },
      { tag: "Shutter Speed Value", before: "1/120", after: null },
      { tag: "Aperture Value", before: "1.78", after: null },
      { tag: "Focal Length In 35mm", before: "24 mm", after: null },
      { tag: "Lens Info", before: "2.22-9mm f/1.78-2.8", after: null },
      { tag: "Digital Zoom Ratio", before: "1", after: null },
      { tag: "Scene Capture Type", before: "Standard", after: null },
      { tag: "Metering Mode", before: "Multi-segment", after: null },
      { tag: "Subject Area", before: "2009 1506 2208 1329", after: null },
      { tag: "Composite Image", before: "General composite", after: null },
      { tag: "Live Photo", before: "Yes", after: null },
      { tag: "HDR", before: "Yes", after: null },
      { tag: "Depth Map", before: "Yes", after: null },
      { tag: "Semantic Style", before: "Standard", after: null },
      { tag: "Image Unique ID", before: "8a3f2c1b…", after: null },
      { tag: "XMP Toolkit", before: "XMP Core 6.0.0", after: null },
      { tag: "Profile Description", before: "Display P3", after: null },
      { tag: "Exif Version", before: "0232", after: null },
      { tag: "Run Time Scale", before: "1000000000", after: null },
      { tag: "Run Time Value", before: "85220941833", after: null },
      { tag: "Acceleration Vector", before: "-0.018 -0.999 -0.032", after: null },
      { tag: "Content Identifier", before: "6C44E9A1-…", after: null },
      { tag: "Creator Tool", before: "17.5.1", after: null },
      { tag: "Color Space", before: "Display P3", after: "Display P3" },
      { tag: "Orientation", before: "Rotate 90 CW", after: "Rotate 90 CW" },
    ],
    examined: 45, removed: 43, preserved: 2,
  },
  3: {
    tags: [
      { tag: "Camera Make", before: "Canon", after: null },
      { tag: "Camera Model", before: "EOS R5", after: null },
      { tag: "GPS Latitude", before: "37.7749° N", after: null },
      { tag: "GPS Longitude", before: "-122.4194° W", after: null },
      { tag: "Date/Time Original", before: "2025-08-14 16:32:10", after: null },
      { tag: "Software", before: "Adobe Lightroom 7.2", after: null },
      { tag: "Color Space", before: "sRGB", after: "sRGB" },
      { tag: "Orientation", before: "Horizontal (normal)", after: "Horizontal" },
    ],
    examined: 8, removed: 6, preserved: 2,
  },
  4: {
    error: true,
    errorTitle: "Unable to read file",
    errorDetail: 'ExifTool reported: "File format not recognized"',
    errorHelp: "The file may be corrupted or in an unsupported format.",
  },
  5: {
    tags: [
      { tag: "Creator", before: "Adobe Acrobat Pro", after: null },
      { tag: "Producer", before: "Adobe PDF Library 21.7", after: null },
      { tag: "Create Date", before: "2025-06-15 10:30:00", after: null },
      { tag: "Modify Date", before: "2025-06-15 10:32:14", after: null },
      { tag: "PDF Version", before: "1.7", after: null },
      { tag: "Page Count", before: "1", after: null },
      { tag: "Tagged PDF", before: "Yes", after: null },
      { tag: "XMP Toolkit", before: "Adobe XMP Core 9.0", after: null },
      { tag: "Document ID", before: "uuid:3a8f…", after: null },
      { tag: "Instance ID", before: "uuid:7b2e…", after: null },
      { tag: "Author", before: "Jane Doe", after: null },
      { tag: "Title", before: "Receipt - Aug 2025", after: null },
    ],
    examined: 12, removed: 12, preserved: 0,
  },
  6: {
    tags: [
      { tag: "Camera Make", before: "Apple", after: null },
      { tag: "Camera Model", before: "iPhone 15 Pro Max", after: null },
      { tag: "Creation Date", before: "2025-09-01 18:45:22", after: null },
      { tag: "Modify Date", before: "2025-09-01 18:45:22", after: null },
      { tag: "Duration", before: "00:02:34", after: null },
      { tag: "Video Frame Rate", before: "59.94", after: null },
      { tag: "Image Size", before: "3840x2160", after: null },
      { tag: "Compressor Name", before: "HEVC", after: null },
      { tag: "Bit Depth", before: "24", after: null },
      { tag: "Audio Format", before: "AAC", after: null },
      { tag: "Audio Channels", before: "2", after: null },
      { tag: "Audio Sample Rate", before: "44100", after: null },
      { tag: "GPS Latitude", before: "34.0522° N", after: null },
      { tag: "GPS Longitude", before: "-118.2437° W", after: null },
      { tag: "GPS Altitude", before: "89.3 m", after: null },
      { tag: "Handler Type", before: "Video Track", after: null },
      { tag: "Handler Description", before: "Core Media Video", after: null },
      { tag: "Media Language", before: "und", after: null },
      { tag: "Compatible Brands", before: "qt, isom", after: null },
      { tag: "Major Brand", before: "qt", after: null },
      { tag: "Movie Header Version", before: "0", after: null },
      { tag: "Current Time", before: "0 s", after: null },
      { tag: "Poster Time", before: "0 s", after: null },
      { tag: "Selection Duration", before: "0 s", after: null },
      { tag: "Time Scale", before: "600", after: null },
      { tag: "Preview Time", before: "0 s", after: null },
      { tag: "Preview Duration", before: "0 s", after: null },
      { tag: "Content Identifier", before: "A1B2C3D4-…", after: null },
      { tag: "Live Photo Auto", before: "1", after: null },
      { tag: "Spatial Over-Capture Group", before: "uuid:…", after: null },
      { tag: "Encoder", before: "Apple", after: null },
      { tag: "Metadata Date", before: "2025-09-01", after: null },
      { tag: "Software", before: "17.5.1", after: null },
      { tag: "Make", before: "Apple", after: null },
      { tag: "Model", before: "iPhone 15 Pro Max", after: null },
      { tag: "Scene Type", before: "Directly photographed", after: null },
      { tag: "Exposure Time", before: "1/60", after: null },
      { tag: "F Number", before: "f/1.78", after: null },
      { tag: "ISO", before: "800", after: null },
      { tag: "Focal Length", before: "6.765 mm", after: null },
      { tag: "White Balance", before: "Auto", after: null },
      { tag: "Acceleration Vector", before: "0.012 -0.997 0.045", after: null },
      { tag: "Rotation", before: "90", after: null },
      { tag: "Media Create Date", before: "2025-09-01 18:45:22", after: null },
      { tag: "Media Modify Date", before: "2025-09-01 18:45:22", after: null },
      { tag: "Track Create Date", before: "2025-09-01 18:45:22", after: null },
      { tag: "Track Modify Date", before: "2025-09-01 18:45:22", after: null },
      { tag: "Matrix Structure", before: "0 1 0 -1 0 0 0 0 1", after: null },
      { tag: "Balance", before: "0", after: null },
      { tag: "Warning", before: "Possibly incomplete", after: null },
      { tag: "XMP Toolkit", before: "XMP Core 6.0.0", after: null },
      { tag: "Profile Description", before: "Rec. 2020 HLG", after: null },
      { tag: "Video Codec", before: "hvc1", after: null },
      { tag: "Audio Codec", before: "mp4a", after: null },
      { tag: "Content Create Date", before: "2025-09-01", after: null },
      { tag: "Orientation", before: "Rotate 90 CW", after: "Rotate 90 CW" },
      { tag: "Color Space", before: "Rec. 2020 HLG", after: "Rec. 2020 HLG" },
      { tag: "Video Frame Count", before: "9222", after: null },
      { tag: "Run Time Scale", before: "1000000000", after: null },
      { tag: "Run Time Value", before: "154023000000", after: null },
      { tag: "Avg Bitrate", before: "24.6 Mbps", after: null },
      { tag: "Image Width", before: "3840", after: null },
      { tag: "Image Height", before: "2160", after: null },
      { tag: "Rotation", before: "90", after: null },
      { tag: "Compressor ID", before: "hvc1", after: null },
      { tag: "Source Image Height", before: "2160", after: null },
      { tag: "Source Image Width", before: "3840", after: null },
    ],
    examined: 67, removed: 65, preserved: 2,
  },
};

const TYPE_COLORS = {
  JPG:  { light: "rgba(59,127,196,0.10)", dark: "rgba(59,127,196,0.18)", text_l: "#2a5f8f", text_d: "#6ba6d6" },
  HEIC: { light: "rgba(59,127,196,0.10)", dark: "rgba(59,127,196,0.18)", text_l: "#2a5f8f", text_d: "#6ba6d6" },
  PNG:  { light: "rgba(59,127,196,0.10)", dark: "rgba(59,127,196,0.18)", text_l: "#2a5f8f", text_d: "#6ba6d6" },
  MOV:  { light: "rgba(130,80,180,0.10)", dark: "rgba(130,80,180,0.18)", text_l: "#6b3fa0", text_d: "#b08cd8" },
  PDF:  { light: "rgba(233,112,67,0.10)", dark: "rgba(233,112,67,0.15)", text_l: "#b35a2d", text_d: "#e09060" },
};

// ─── Theme ───────────────────────────────────────────────────────────────────
const THEMES = {
  light: {
    bg: "#F5F6F8", surface: "#FFFFFF", elevated: "#ECEEF2", border: "#DADEE4",
    body: "#3B4351", heading: "#1E2028", muted: "#9BA3B0", secondary: "#66758C",
    chrome: "#FAFAFA", sidebar: "#FFFFFF",
    brand: "#521737", gold: "#F8D057", orange: "#E97043",
    success: "#2D8659", successBg: "#E8F5EE",
    error: "#C44536", errorBg: "#FCEAE8",
    info: "#3B7FC4",
    strike: "#C44536", kept: "#2D8659",
    rowAlt: "rgba(0,0,0,0.025)", rowHover: "rgba(0,0,0,0.045)",
    diffBg: "#F9FAFB",
    checkAccent: "#521737",
  },
  dark: {
    bg: "#141416", surface: "#1C1C1F", elevated: "#252528", border: "#48484D",
    body: "#C5C5CB", heading: "#EEEEF0", muted: "#818188", secondary: "#A0A0A8",
    chrome: "#0E0E10", sidebar: "#1C1C1F",
    brand: "#C4467A", gold: "#F8D057", orange: "#E97043",
    success: "#2D8659", successBg: "#1A3D2B",
    error: "#C44536", errorBg: "#3D1A16",
    info: "#3B7FC4",
    strike: "#E97043", kept: "#2D8659",
    rowAlt: "rgba(255,255,255,0.03)", rowHover: "rgba(255,255,255,0.06)",
    diffBg: "#1A1A1D",
    checkAccent: "#C4467A",
  },
};

// ─── Icons ───────────────────────────────────────────────────────────────────
const Spinner = ({ color }) => (
  <svg width="14" height="14" viewBox="0 0 14 14" style={{ animation: "exif-spin 0.8s linear infinite" }}>
    <circle cx="7" cy="7" r="5.5" fill="none" stroke={color} strokeWidth="2" strokeDasharray="20 12" strokeLinecap="round" />
  </svg>
);

const Check = ({ color }) => (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
    <path d="M3 7.5l2.8 2.8L11 4" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const XIcon = ({ color }) => (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
    <path d="M4 4l6 6M10 4l-6 6" stroke={color} strokeWidth="2" strokeLinecap="round" />
  </svg>
);

const Dot = ({ color }) => (
  <svg width="8" height="8" viewBox="0 0 8 8"><circle cx="4" cy="4" r="3" fill={color} /></svg>
);

const ImagesIcon = ({ color }) => (
  <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
    <rect x="6" y="10" width="28" height="24" rx="3" stroke={color} strokeWidth="2" />
    <rect x="14" y="16" width="28" height="24" rx="3" stroke={color} strokeWidth="2" fill="none" />
    <circle cx="22" cy="22" r="3" stroke={color} strokeWidth="1.5" />
    <path d="M14 36l8-10 5 6 4-3 11 7" stroke={color} strokeWidth="1.5" strokeLinejoin="round" />
  </svg>
);

const ChevronLeft = ({ size = 12, color }) => (
  <svg width={size} height={size} viewBox="0 0 12 12" fill="none">
    <path d="M7.5 2.5L4 6l3.5 3.5" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const ChevronRight = ({ size = 12, color }) => (
  <svg width={size} height={size} viewBox="0 0 12 12" fill="none">
    <path d="M4.5 2.5L8 6l-3.5 3.5" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const ChevronDown = ({ size = 10, color }) => (
  <svg width={size} height={size} viewBox="0 0 10 10" fill="none">
    <path d="M2.5 3.75L5 6.25l2.5-2.5" stroke={color} strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

// ─── Component ───────────────────────────────────────────────────────────────
export default function ExifCleaner() {
  const [dark, setDark] = useState(true);
  const [appState, setAppState] = useState("empty"); // empty | dragover | processing | complete
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [files, setFiles] = useState([]);
  const [expandedRow, setExpandedRow] = useState(null);
  const [expandedVisible, setExpandedVisible] = useState(false);
  const [settings, setSettings] = useState({ orientation: true, keepOriginals: false, dates: true });
  const processTimeoutRef = useRef([]);
  const [dragCount, setDragCount] = useState(0);

  const t = THEMES[dark ? "dark" : "light"];

  const cleanup = useCallback(() => {
    processTimeoutRef.current.forEach(clearTimeout);
    processTimeoutRef.current = [];
  }, []);

  const startProcessing = useCallback(() => {
    cleanup();
    setAppState("processing");
    setSidebarOpen(true);
    setExpandedRow(null);
    setExpandedVisible(false);

    const initial = FILES_DATA.map((f, i) => ({
      ...f,
      currentStatus: "pending",
      visible: false,
      currentBefore: null,
      currentAfter: null,
      currentError: null,
    }));
    setFiles(initial);

    // Stagger file appearance
    FILES_DATA.forEach((_, i) => {
      const tid = setTimeout(() => {
        setFiles(prev => prev.map((f, j) => j === i ? { ...f, visible: true } : f));
      }, i * 100);
      processTimeoutRef.current.push(tid);
    });

    // Process sequentially
    const processStart = 500;
    const processGap = 500;
    FILES_DATA.forEach((file, i) => {
      // Start processing
      const startTid = setTimeout(() => {
        setFiles(prev => prev.map((f, j) => j === i ? { ...f, currentStatus: "processing" } : f));
      }, processStart + i * processGap);
      processTimeoutRef.current.push(startTid);

      // Complete processing
      const endTid = setTimeout(() => {
        setFiles(prev => prev.map((f, j) => j === i ? {
          ...f,
          currentStatus: file.status,
          currentBefore: file.before,
          currentAfter: file.after,
          currentError: file.error || null,
        } : f));

        // Check if all done
        if (i === FILES_DATA.length - 1) {
          const doneTid = setTimeout(() => {
            setAppState("complete");
            // Auto-expand portrait.png
            const autoTid = setTimeout(() => {
              setExpandedRow(3);
              setTimeout(() => setExpandedVisible(true), 50);
            }, 300);
            processTimeoutRef.current.push(autoTid);
          }, 100);
          processTimeoutRef.current.push(doneTid);
        }
      }, processStart + i * processGap + 400);
      processTimeoutRef.current.push(endTid);
    });
  }, [cleanup]);

  const handleClear = useCallback(() => {
    cleanup();
    setExpandedRow(null);
    setExpandedVisible(false);
    setFiles([]);
    setAppState("empty");
    setSidebarOpen(true);
  }, [cleanup]);

  const handleRowClick = useCallback((id) => {
    const file = files.find(f => f.id === id);
    if (!file || file.currentStatus === "pending" || file.currentStatus === "processing") return;
    if (expandedRow === id) {
      setExpandedVisible(false);
      setTimeout(() => setExpandedRow(null), 200);
    } else {
      if (expandedRow !== null) {
        setExpandedVisible(false);
        setTimeout(() => {
          setExpandedRow(id);
          setTimeout(() => setExpandedVisible(true), 50);
        }, 200);
      } else {
        setExpandedRow(id);
        setTimeout(() => setExpandedVisible(true), 50);
      }
    }
  }, [expandedRow, files]);

  useEffect(() => () => cleanup(), [cleanup]);

  const completedCount = files.filter(f => f.currentStatus === "success").length;
  const errorCount = files.filter(f => f.currentStatus === "error").length;
  const totalTags = files.reduce((sum, f) => sum + (f.currentBefore || 0), 0);
  const allDone = files.length > 0 && files.every(f => f.currentStatus === "success" || f.currentStatus === "error");

  // ─── Styles ──────────────────────────────────────────────────────────────
  const font = `system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;
  const mono = `ui-monospace, "SF Mono", Menlo, Consolas, monospace`;

  const containerStyle = {
    width: 700, height: 450, borderRadius: 10, overflow: "hidden",
    fontFamily: font, fontSize: 14, color: t.body, background: t.bg,
    display: "flex", flexDirection: "column", position: "relative",
    border: `1px solid ${t.border}`, boxShadow: dark ? "0 8px 32px rgba(0,0,0,0.5)" : "0 8px 32px rgba(0,0,0,0.12)",
    userSelect: "none",
  };

  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: dark ? "#0a0a0b" : "#e8eaee", padding: 20 }}>
      <style>{`
        @keyframes exif-spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        @keyframes exif-fadeIn { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: translateY(0); } }
        .exif-row-enter { animation: exif-fadeIn 0.15s ease-out forwards; }
        .exif-scrollbar::-webkit-scrollbar { width: 6px; }
        .exif-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .exif-scrollbar::-webkit-scrollbar-thumb { background: ${t.border}; border-radius: 3px; }
        .exif-checkbox { appearance: none; width: 14px; height: 14px; border: 1.5px solid ${t.muted}; border-radius: 3px; cursor: pointer; position: relative; flex-shrink: 0; margin: 0; }
        .exif-checkbox:checked { background: ${t.checkAccent}; border-color: ${t.checkAccent}; }
        .exif-checkbox:checked::after { content: ''; position: absolute; left: 3.5px; top: 1px; width: 4px; height: 7px; border: solid white; border-width: 0 1.5px 1.5px 0; transform: rotate(45deg); }
      `}</style>

      <div style={containerStyle}>
        {/* ─── Title Bar ─────────────────────────────────────── */}
        <div style={{
          height: 36, background: t.chrome, borderBottom: `1px solid ${t.border}`,
          display: "flex", alignItems: "center", padding: "0 12px", flexShrink: 0,
        }}>
          <div style={{ display: "flex", gap: 6 }}>
            <div style={{ width: 10, height: 10, borderRadius: "50%", background: "#FF5F57" }} />
            <div style={{ width: 10, height: 10, borderRadius: "50%", background: "#FEBC2E" }} />
            <div style={{ width: 10, height: 10, borderRadius: "50%", background: "#28C840" }} />
          </div>
          <div style={{ flex: 1, textAlign: "center", fontSize: 12, fontWeight: 600, color: t.heading, letterSpacing: "0.02em" }}>
            ExifCleaner
          </div>
          <button
            onClick={() => setDark(!dark)}
            style={{ background: "none", border: "none", cursor: "pointer", fontSize: 14, color: t.muted, padding: 2, lineHeight: 1 }}
            title={dark ? "Light mode" : "Dark mode"}
          >
            {dark ? "☀" : "☽"}
          </button>
        </div>

        {/* ─── Body ──────────────────────────────────────────── */}
        <div style={{ flex: 1, display: "flex", overflow: "hidden", position: "relative" }}>

          {/* ─── Sidebar ───────────────────────────────────────── */}
          {appState !== "empty" && (
            <div style={{
              width: sidebarOpen ? 160 : 0, overflow: "hidden", flexShrink: 0,
              transition: "width 0.2s ease-in-out",
              background: t.sidebar, borderRight: sidebarOpen ? `1px solid ${t.border}` : "none",
              display: "flex", flexDirection: "column",
            }}>
              <div style={{ width: 160, padding: "10px 10px 8px", display: "flex", flexDirection: "column", gap: 12, flex: 1 }}>
                {/* Settings */}
                <div>
                  <div style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", color: t.muted, marginBottom: 8 }}>
                    Settings
                  </div>
                  {[
                    { key: "orientation", label: "Preserve orientation" },
                    { key: "keepOriginals", label: "Keep original files" },
                    { key: "dates", label: "Preserve file dates" },
                  ].map(({ key, label }) => (
                    <label key={key} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, color: t.body, cursor: "pointer", marginBottom: 6 }}>
                      <input
                        type="checkbox"
                        className="exif-checkbox"
                        checked={settings[key]}
                        onChange={() => setSettings(s => ({ ...s, [key]: !s[key] }))}
                      />
                      {label}
                    </label>
                  ))}
                </div>

                {/* Divider */}
                <div style={{ height: 1, background: t.border }} />

                {/* Batch */}
                <div>
                  <div style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", color: t.muted, marginBottom: 8 }}>
                    Batch
                  </div>
                  <div style={{ fontSize: 13, color: t.body, lineHeight: 1.7 }}>
                    <div>{files.length} files</div>
                    {completedCount > 0 && (
                      <div style={{ color: t.success }}>{completedCount} cleaned <span style={{ fontSize: 11 }}>✓</span></div>
                    )}
                    {errorCount > 0 && (
                      <div style={{ color: t.error }}>{errorCount} error <span style={{ fontSize: 11 }}>✗</span></div>
                    )}
                    {allDone && totalTags > 0 && (
                      <div style={{ color: t.secondary }}>{totalTags} tags removed</div>
                    )}
                  </div>
                </div>

                <div style={{ flex: 1 }} />

                {/* Clear */}
                {allDone && (
                  <button
                    onClick={handleClear}
                    style={{
                      width: "100%", padding: "6px 0", fontSize: 12, fontWeight: 500,
                      background: "none", border: `1px solid ${t.border}`, borderRadius: 5,
                      color: t.secondary, cursor: "pointer", transition: "all 0.15s",
                    }}
                    onMouseEnter={e => { e.target.style.background = t.elevated; e.target.style.color = t.body; }}
                    onMouseLeave={e => { e.target.style.background = "none"; e.target.style.color = t.secondary; }}
                  >
                    Clear list
                  </button>
                )}
              </div>
            </div>
          )}

          {/* ─── Main Content ─────────────────────────────────── */}
          <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", position: "relative" }}>

            {/* ─── Empty / Drag State ────────────────────────── */}
            {(appState === "empty" || appState === "dragover") && (
              <div
                style={{
                  flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
                  margin: 16, borderRadius: 8,
                  border: `2px dashed ${appState === "dragover" ? t.gold : t.border}`,
                  background: appState === "dragover" ? (dark ? "rgba(248,208,87,0.05)" : "rgba(248,208,87,0.08)") : "transparent",
                  transition: "all 0.2s ease",
                  cursor: "pointer",
                }}
                onDragEnter={(e) => { e.preventDefault(); setDragCount(c => c + 1); setAppState("dragover"); }}
                onDragOver={(e) => e.preventDefault()}
                onDragLeave={(e) => { e.preventDefault(); setDragCount(c => { const next = c - 1; if (next <= 0) setAppState("empty"); return Math.max(0, next); }); }}
                onDrop={(e) => { e.preventDefault(); setDragCount(0); startProcessing(); }}
                onClick={() => startProcessing()}
              >
                <ImagesIcon color={appState === "dragover" ? t.gold : t.muted} />
                <div style={{ marginTop: 12, fontSize: 15, color: appState === "dragover" ? t.gold : t.body, fontWeight: 500 }}>
                  {appState === "dragover" ? "Release to clean" : "Drop files here to"}
                </div>
                {appState !== "dragover" && (
                  <div style={{ fontSize: 15, color: t.body, fontWeight: 500, marginBottom: 16 }}>remove metadata</div>
                )}
                {appState !== "dragover" && (
                  <button style={{
                    padding: "7px 20px", fontSize: 13, fontWeight: 500, borderRadius: 6,
                    background: t.brand, color: "#fff", border: "none", cursor: "pointer",
                    transition: "opacity 0.15s",
                  }}
                  onMouseEnter={e => e.target.style.opacity = "0.85"}
                  onMouseLeave={e => e.target.style.opacity = "1"}
                  >
                    Add files
                  </button>
                )}
              </div>
            )}

            {/* ─── Table ─────────────────────────────────────── */}
            {(appState === "processing" || appState === "complete") && (
              <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
                {/* Header */}
                <div style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 48px 64px 50px 50px 32px",
                  gap: 0,
                  padding: "0 12px",
                  height: 28,
                  alignItems: "center",
                  borderBottom: `1px solid ${t.border}`,
                  background: t.surface,
                  flexShrink: 0,
                  position: "sticky", top: 0, zIndex: 2,
                }}>
                  {["Filename", "Type", "Size", "Before", "After", ""].map((h, i) => (
                    <div key={h || i} style={{
                      fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em",
                      color: t.muted,
                      textAlign: i === 0 ? "left" : i === 5 ? "center" : i >= 2 ? "right" : "center",
                      paddingRight: i >= 2 && i <= 4 ? 4 : 0,
                    }}>
                      {h}
                    </div>
                  ))}
                </div>

                {/* Rows */}
                <div className="exif-scrollbar" style={{ flex: 1, overflowY: "auto", background: t.surface }}>
                  {files.map((file, i) => {
                    if (!file.visible) return null;
                    const isComplete = file.currentStatus === "success" || file.currentStatus === "error";
                    const isExpanded = expandedRow === file.id;
                    const isSuccess = file.currentStatus === "success";
                    const isError = file.currentStatus === "error";
                    const isPending = file.currentStatus === "pending";
                    const isProcessing = file.currentStatus === "processing";
                    const typeCfg = TYPE_COLORS[file.type] || TYPE_COLORS.JPG;

                    return (
                      <div key={file.id} className="exif-row-enter">
                        {/* Row */}
                        <div
                          onClick={() => isComplete && handleRowClick(file.id)}
                          style={{
                            display: "grid",
                            gridTemplateColumns: "1fr 48px 64px 50px 50px 32px",
                            gap: 0,
                            padding: "0 12px",
                            height: 32,
                            alignItems: "center",
                            background: isExpanded ? t.rowHover : (i % 2 === 1 ? t.rowAlt : "transparent"),
                            cursor: isComplete ? "pointer" : "default",
                            transition: "background 0.1s",
                            borderBottom: isExpanded ? "none" : undefined,
                          }}
                          onMouseEnter={e => { if (isComplete && !isExpanded) e.currentTarget.style.background = t.rowHover; }}
                          onMouseLeave={e => { if (!isExpanded) e.currentTarget.style.background = i % 2 === 1 ? t.rowAlt : "transparent"; }}
                        >
                          {/* Filename */}
                          <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0, paddingRight: 8 }}>
                            {isComplete && (
                              <span style={{
                                display: "inline-flex", transition: "transform 0.2s",
                                transform: isExpanded ? "rotate(90deg)" : "rotate(0deg)",
                              }}>
                                <ChevronRight size={10} color={t.muted} />
                              </span>
                            )}
                            <span style={{
                              fontSize: 13, color: t.body, overflow: "hidden",
                              textOverflow: "ellipsis", whiteSpace: "nowrap",
                            }} title={file.name}>
                              {file.name}
                            </span>
                          </div>

                          {/* Type */}
                          <div style={{ display: "flex", justifyContent: "center" }}>
                            <span style={{
                              fontSize: 10, fontWeight: 600, textTransform: "uppercase",
                              padding: "1px 5px", borderRadius: 3,
                              background: dark ? typeCfg.dark : typeCfg.light,
                              color: dark ? typeCfg.text_d : typeCfg.text_l,
                              lineHeight: "16px",
                            }}>
                              {file.type}
                            </span>
                          </div>

                          {/* Size */}
                          <div style={{ fontSize: 12, color: t.secondary, textAlign: "right", paddingRight: 4 }}>
                            {file.size}
                          </div>

                          {/* Before */}
                          <div style={{ fontSize: 12, textAlign: "right", paddingRight: 4, color: t.body, fontVariantNumeric: "tabular-nums" }}>
                            {file.currentBefore !== null ? file.currentBefore : (isProcessing ? "..." : "—")}
                          </div>

                          {/* After */}
                          <div style={{
                            fontSize: 12, textAlign: "right", paddingRight: 4, fontVariantNumeric: "tabular-nums",
                            color: isError ? t.error : t.body,
                          }}>
                            {isError ? (
                              <span style={{ fontSize: 11 }} title={file.currentError}>{file.currentError}</span>
                            ) : file.currentAfter !== null ? file.currentAfter : (isProcessing ? "..." : "—")}
                          </div>

                          {/* Status */}
                          <div style={{ display: "flex", justifyContent: "center", alignItems: "center" }}>
                            {isProcessing && <Spinner color={t.info} />}
                            {isSuccess && <Check color={t.success} />}
                            {isError && <XIcon color={t.error} />}
                            {isPending && <Dot color={t.muted} />}
                          </div>
                        </div>

                        {/* ─── Expanded Diff Panel ──────────────── */}
                        <div style={{
                          maxHeight: isExpanded ? 500 : 0,
                          overflow: "hidden",
                          transition: "max-height 0.2s ease-out",
                          background: t.diffBg,
                          borderBottom: isExpanded ? `1px solid ${t.border}` : "none",
                        }}>
                          <div style={{
                            opacity: expandedVisible && isExpanded ? 1 : 0,
                            transition: "opacity 0.15s ease 0.05s",
                            padding: "10px 16px 12px 32px",
                          }}>
                            {METADATA[file.id]?.error ? (
                              // Error detail
                              <div>
                                <div style={{ fontSize: 13, fontWeight: 600, color: t.error, marginBottom: 4 }}>
                                  Error: {METADATA[file.id].errorTitle}
                                </div>
                                <div style={{ fontSize: 12, fontFamily: mono, color: t.muted, marginBottom: 6 }}>
                                  {METADATA[file.id].errorDetail}
                                </div>
                                <div style={{ fontSize: 12, color: t.secondary }}>
                                  {METADATA[file.id].errorHelp}
                                </div>
                              </div>
                            ) : METADATA[file.id]?.tags ? (
                              // Metadata diff table
                              <div>
                                <div style={{
                                  display: "grid",
                                  gridTemplateColumns: "160px 1fr 100px",
                                  gap: "0",
                                  fontSize: 11,
                                  fontFamily: mono,
                                  marginBottom: 4,
                                }}>
                                  <div style={{ fontWeight: 600, color: t.muted, padding: "2px 0", textTransform: "uppercase", letterSpacing: "0.04em" }}>Tag</div>
                                  <div style={{ fontWeight: 600, color: t.muted, padding: "2px 0", textTransform: "uppercase", letterSpacing: "0.04em" }}>Before</div>
                                  <div style={{ fontWeight: 600, color: t.muted, padding: "2px 0", textTransform: "uppercase", letterSpacing: "0.04em" }}>After</div>
                                </div>
                                <div style={{ height: 1, background: t.border, marginBottom: 2 }} />
                                <div className="exif-scrollbar" style={{ maxHeight: 200, overflowY: "auto" }}>
                                  {METADATA[file.id].tags.map((tag, ti) => {
                                    const removed = tag.after === null;
                                    return (
                                      <div key={ti} style={{
                                        display: "grid",
                                        gridTemplateColumns: "160px 1fr 100px",
                                        gap: "0",
                                        fontSize: 12,
                                        fontFamily: mono,
                                        padding: "2px 0",
                                        borderBottom: ti < METADATA[file.id].tags.length - 1 ? `1px solid ${dark ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.04)"}` : "none",
                                      }}>
                                        <div style={{ color: t.secondary, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", paddingRight: 8 }} title={tag.tag}>
                                          {tag.tag}
                                        </div>
                                        <div style={{
                                          color: removed ? t.strike : t.body,
                                          textDecoration: removed ? "line-through" : "none",
                                          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", paddingRight: 8,
                                        }} title={tag.before}>
                                          {tag.before}
                                        </div>
                                        <div style={{
                                          color: removed ? t.muted : t.kept,
                                          fontStyle: removed ? "italic" : "normal",
                                          fontSize: removed ? 11 : 12,
                                        }}>
                                          {removed ? "(removed)" : tag.after}
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>
                                {/* Summary */}
                                <div style={{
                                  marginTop: 6, paddingTop: 6,
                                  borderTop: `1px solid ${t.border}`,
                                  fontSize: 11, color: t.muted,
                                }}>
                                  {METADATA[file.id].examined} tags examined · {METADATA[file.id].removed} removed · {METADATA[file.id].preserved} preserved
                                </div>
                              </div>
                            ) : null}
                          </div>
                        </div>
                      </div>
                    );
                  })}

                  {/* Drop more zone at bottom */}
                  {appState === "complete" && (
                    <div
                      style={{
                        padding: "16px 0", textAlign: "center", fontSize: 12, color: t.muted,
                        borderTop: `1px dashed ${t.border}`, margin: "0 12px",
                        cursor: "pointer",
                      }}
                      onClick={startProcessing}
                    >
                      + Drop more files or click to add
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ─── Footer / Sidebar Toggle ───────────────────────── */}
        {appState !== "empty" && (
          <div style={{
            height: 28, borderTop: `1px solid ${t.border}`, background: t.chrome,
            display: "flex", alignItems: "center", padding: "0 10px", flexShrink: 0,
          }}>
            <button
              onClick={() => setSidebarOpen(!sidebarOpen)}
              style={{
                background: "none", border: "none", cursor: "pointer",
                fontSize: 12, color: t.muted, display: "flex", alignItems: "center", gap: 4,
                padding: "2px 4px", borderRadius: 3,
              }}
              onMouseEnter={e => e.currentTarget.style.color = t.body}
              onMouseLeave={e => e.currentTarget.style.color = t.muted}
            >
              {sidebarOpen ? <ChevronLeft size={12} color="currentColor" /> : <ChevronRight size={12} color="currentColor" />}
              {sidebarOpen ? "Hide" : "Show"}
            </button>

            {allDone && (
              <div style={{ flex: 1, textAlign: "right", fontSize: 11, color: t.muted }}>
                {completedCount + errorCount} files · {completedCount} cleaned · {errorCount} error{errorCount !== 1 ? "s" : ""}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
