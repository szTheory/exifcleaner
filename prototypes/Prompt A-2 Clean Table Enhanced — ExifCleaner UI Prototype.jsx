import { useState, useEffect, useRef, useCallback, useMemo } from "react";

const FLAT_FILES = [
  { id: "f1", name: "vacation_photo.jpg", before: 23, after: 0, status: "success", group: null },
  { id: "f2", name: "selfie_park.heic", before: 45, after: 0, status: "success", group: null },
  { id: "f3", name: "portrait.png", before: 8, after: 0, status: "success", group: null },
  { id: "f4", name: "Screenshot_2025-01.png", before: 3, after: 0, status: "success", group: null },
  { id: "f5", name: "tax_return_2024.pdf", before: 12, after: 0, status: "success", group: null },
  { id: "f6", name: "damaged_photo.jpg", before: null, after: "Can't read file", status: "error", group: null },
  { id: "f7", name: "birthday_party.mov", before: 67, after: 0, status: "success", group: null },
  { id: "f8", name: "cover_letter.docx", before: 9, after: 0, status: "success", group: null },
];

const FOLDER_FILES = [
  { id: "g1", name: "IMG_0001.jpg", before: 23, after: 0, status: "success", group: "Photos/" },
  { id: "g2", name: "IMG_0002.jpg", before: 31, after: 0, status: "success", group: "Photos/" },
  { id: "g3", name: "IMG_0003.jpg", before: 18, after: 0, status: "success", group: "Photos/" },
  { id: "g4", name: "IMG_0004.jpg", before: 27, after: 0, status: "success", group: "Photos/" },
  { id: "g5", name: "IMG_0005.jpg", before: 14, after: 0, status: "success", group: "Photos/" },
  { id: "g6", name: "IMG_0006.jpg", before: 22, after: 0, status: "success", group: "Photos/" },
  { id: "g7", name: "IMG_0007.jpg", before: 19, after: 0, status: "success", group: "Photos/" },
  { id: "g8", name: "IMG_0008.jpg", before: 35, after: 0, status: "success", group: "Photos/" },
  { id: "g9", name: "IMG_0009.jpg", before: 11, after: 0, status: "success", group: "Photos/" },
  { id: "g10", name: "IMG_0010.jpg", before: 28, after: 0, status: "success", group: "Photos/" },
  { id: "g11", name: "IMG_0011.jpg", before: 16, after: 0, status: "success", group: "Photos/" },
  { id: "g12", name: "IMG_0012.jpg", before: 20, after: 0, status: "success", group: "Photos/" },
  { id: "g13", name: "beach_sunset.jpg", before: 14, after: 0, status: "success", group: "Photos/vacation/" },
  { id: "g14", name: "hotel_room.heic", before: 22, after: 0, status: "success", group: "Photos/vacation/" },
  { id: "g15", name: "pool_photo.heic", before: 33, after: 0, status: "success", group: "Photos/vacation/" },
  { id: "g16", name: "restaurant.jpg", before: 17, after: 0, status: "success", group: "Photos/vacation/" },
  { id: "g17", name: "damaged_photo.jpg", before: null, after: "Can't read file", status: "error", group: "Photos/vacation/" },
  { id: "g18", name: "city_walk.mov", before: 41, after: 0, status: "success", group: "Photos/vacation/" },
  { id: "g19", name: "IMG_4521.heic", before: 45, after: 0, status: "success", group: "Photos/portraits/" },
  { id: "g20", name: "IMG_4522.heic", before: 38, after: 0, status: "success", group: "Photos/portraits/" },
  { id: "g21", name: "IMG_4523.heic", before: 42, after: 0, status: "success", group: "Photos/portraits/" },
  { id: "g22", name: "headshot.png", before: 8, after: 0, status: "success", group: "Photos/portraits/" },
  { id: "g23", name: "Screenshot_2025-01-15.png", before: 3, after: 0, status: "success", group: "Screenshots/" },
  { id: "g24", name: "Screenshot_2025-02-01.png", before: 3, after: 0, status: "success", group: "Screenshots/" },
  { id: "g25", name: "Screenshot_2025-02-10.png", before: 4, after: 0, status: "success", group: "Screenshots/" },
  { id: "g26", name: "Screen Recording 2025.mov", before: 12, after: 0, status: "success", group: "Screenshots/" },
  { id: "g27", name: "tax_return_2024.pdf", before: 8, after: 0, status: "success", group: "Documents/" },
  { id: "g28", name: "lease_agreement.pdf", before: 6, after: 0, status: "success", group: "Documents/" },
  { id: "g29", name: "locked_file.pdf", before: null, after: "Permission denied", status: "error", group: "Documents/" },
  { id: "g30", name: "cover_letter.docx", before: 9, after: 0, status: "success", group: "Documents/" },
  { id: "g31", name: "resume_2025.docx", before: 11, after: 0, status: "success", group: "Documents/" },
  { id: "g32", name: "birthday_party.mov", before: 67, after: 0, status: "success", group: "Videos/" },
  { id: "g33", name: "drone_footage.mov", before: 54, after: 0, status: "success", group: "Videos/" },
  { id: "g34", name: "random_selfie.jpg", before: 29, after: 0, status: "success", group: null },
  { id: "g35", name: "meeting_notes.docx", before: 7, after: 0, status: "success", group: null },
  { id: "g36", name: "medical_records.pdf", before: 15, after: 0, status: "success", group: null },
  { id: "g37", name: "IMG_4524.heic", before: 36, after: 0, status: "success", group: null },
  { id: "g38", name: "concert_video.mov", before: 48, after: 0, status: "success", group: null },
];

const METADATA_TAGS = {
  g4: {
    tags: [
      { name: "Camera Make", before: "Canon", removed: true },
      { name: "Camera Model", before: "EOS R5", removed: true },
      { name: "Lens Model", before: "RF 24-70mm f/2.8", removed: true },
      { name: "F Number", before: "f/2.8", removed: true },
      { name: "ISO", before: "400", removed: true },
      { name: "GPS Latitude", before: "37.7749° N", removed: true },
      { name: "GPS Longitude", before: "-122.4194° W", removed: true },
      { name: "Date/Time Original", before: "2025-08-14 16:32", removed: true },
      { name: "Software", before: "Lightroom 7.2", removed: true },
      { name: "Artist", before: "Jonathan", removed: true },
      { name: "Copyright", before: "© 2025", removed: true },
      { name: "Exposure Time", before: "1/250s", removed: true },
      { name: "White Balance", before: "Auto", removed: true },
      { name: "Flash", before: "Off", removed: true },
      { name: "Metering Mode", before: "Multi-segment", removed: true },
      { name: "Focal Length", before: "50mm", removed: true },
      { name: "Image Width", before: "8192", removed: true },
      { name: "Image Height", before: "5464", removed: true },
      { name: "Bits Per Sample", before: "8", removed: true },
      { name: "Compression", before: "JPEG", removed: true },
      { name: "Thumbnail Offset", before: "1234", removed: true },
      { name: "Thumbnail Length", before: "5678", removed: true },
      { name: "XMP Toolkit", before: "Adobe XMP 5.6", removed: true },
      { name: "Creator Tool", before: "Lightroom 7.2", removed: true },
      { name: "Serial Number", before: "012345678", removed: true },
      { name: "Color Space", before: "sRGB", removed: false },
      { name: "Orientation", before: "Horizontal", removed: false },
    ],
    examined: 27, removed: 25, preserved: 2,
  },
};

function generateMetadata(file) {
  if (METADATA_TAGS[file.id]) return METADATA_TAGS[file.id];
  if (file.status === "error") return null;
  const count = file.before || 0;
  const preserved = Math.min(2, Math.floor(count * 0.08));
  const removed = count - preserved;
  const allTags = [
    "Camera Make", "Camera Model", "Lens Model", "F Number", "ISO",
    "GPS Latitude", "GPS Longitude", "Date/Time Original", "Software",
    "Artist", "Copyright", "Exposure Time", "White Balance", "Flash",
    "Metering Mode", "Focal Length", "Image Width", "Image Height",
    "Bits Per Sample", "Compression", "Thumbnail Offset", "Serial Number",
    "XMP Toolkit", "Creator Tool", "Shutter Speed", "Aperture Value",
    "Brightness", "Exposure Bias", "Max Aperture", "Subject Distance",
  ];
  const vals = [
    "Canon", "EOS R6", "RF 50mm f/1.8", "f/4.0", "200",
    "42.3601° N", "-71.0589° W", "2025-06-10 09:15", "Photoshop 25.1",
    "Photographer", "© 2025", "1/125s", "Daylight", "No Flash",
    "Center-weighted", "35mm", "6000", "4000",
    "8", "JPEG", "2048", "SN-99887766",
    "Adobe XMP 5.6", "Camera Raw 16.1", "1/200s", "f/5.6",
    "128", "0 EV", "f/2.8", "3.5m",
  ];
  const preservedNames = ["Color Space", "Orientation"];
  const preservedVals = ["sRGB", "Horizontal"];
  const tags = [];
  for (let i = 0; i < removed && i < allTags.length; i++) {
    tags.push({ name: allTags[i], before: vals[i] || "value", removed: true });
  }
  for (let i = 0; i < preserved; i++) {
    tags.push({ name: preservedNames[i], before: preservedVals[i], removed: false });
  }
  return { tags, examined: count, removed, preserved };
}

const ERROR_DETAILS = {
  "Can't read file": {
    title: "Unable to read file",
    detail: 'ExifTool: "File format error — file is corrupted or truncated"',
    help: "The file may be damaged. Try opening it in an image editor to verify.",
  },
  "Permission denied": {
    title: "Permission denied",
    detail: 'ExifTool: "Error opening file — permission denied"',
    help: "Check file permissions or try running ExifCleaner as administrator.",
  },
};

// --- Component ---

export default function ExifCleaner() {
  const [dark, setDark] = useState(false);
  const [appState, setAppState] = useState("empty"); // empty | dragover | processing | complete
  const [files, setFiles] = useState([]);
  const [processedIndex, setProcessedIndex] = useState(-1);
  const [visibleCount, setVisibleCount] = useState(0);
  const [expandedRow, setExpandedRow] = useState(null);
  const [collapsedGroups, setCollapsedGroups] = useState({});
  const [hoveredRow, setHoveredRow] = useState(null);
  const [toast, setToast] = useState(null);
  const [showSettings, setShowSettings] = useState(false);
  const [settings, setSettings] = useState({ orientation: true, keepOriginal: false, timestamps: true });
  const [progressDone, setProgressDone] = useState(false);
  const [progressGreen, setProgressGreen] = useState(false);
  const [progressHidden, setProgressHidden] = useState(true);
  const [isFolder, setIsFolder] = useState(false);
  const [showMoreTags, setShowMoreTags] = useState(false);

  const scrollRef = useRef(null);
  const processingRowRef = useRef(null);
  const timerRef = useRef(null);
  const autoStarted = useRef(false);

  const t = useMemo(() => {
    const l = {
      bg: "#F5F6F8", surface: "#FFFFFF", border: "#DADEE4", body: "#3B4351",
      heading: "#1E2028", muted: "#9BA3B0", secondary: "#66758C", chrome: "#FAFAFA",
      groupBg: "#EEF0F3", burgundy: "#521737", gold: "#F8D057", orange: "#E97043",
      success: "#2D8659", successBg: "#E8F5EE", error: "#C44536", errorBg: "#FCEAE8",
      strike: "#C44536", preserved: "#2D8659", hover: "#EEF0F3", elevated: "#FFFFFF",
    };
    const d = {
      bg: "#141416", surface: "#1C1C1F", border: "#48484D", body: "#C5C5CB",
      heading: "#EEEEF0", muted: "#818188", secondary: "#9BA3B0", chrome: "#0E0E10",
      groupBg: "#1C1C1F", burgundy: "#C4467A", gold: "#F8D057", orange: "#E97043",
      success: "#2D8659", successBg: "#1A3D2B", error: "#C44536", errorBg: "#3D1A16",
      strike: "#E97043", preserved: "#2D8659", hover: "#252528", elevated: "#252528",
    };
    return dark ? d : l;
  }, [dark]);

  const totalFiles = files.length;
  const completedCount = processedIndex + 1;
  const successCount = files.filter((f, i) => i <= processedIndex && f.status === "success").length;
  const errorCount = files.filter((f, i) => i <= processedIndex && f.status === "error").length;

  const groups = useMemo(() => {
    if (!isFolder) return null;
    const order = [];
    const seen = new Set();
    files.forEach(f => {
      const g = f.group || "__individual__";
      if (!seen.has(g)) { seen.add(g); order.push(g); }
    });
    return order.map(g => ({
      key: g,
      label: g === "__individual__" ? "Individual files" : g,
      files: files.filter(f => (f.group || "__individual__") === g),
    }));
  }, [files, isFolder]);

  const startFlow = useCallback((folderMode) => {
    const data = folderMode ? FOLDER_FILES : FLAT_FILES;
    setIsFolder(folderMode);
    setFiles(data);
    setProcessedIndex(-1);
    setVisibleCount(0);
    setExpandedRow(null);
    setCollapsedGroups({});
    setProgressDone(false);
    setProgressGreen(false);
    setProgressHidden(true);
    setShowMoreTags(false);
    setAppState("dragover");

    setTimeout(() => {
      setAppState("processing");
      setProgressHidden(false);
      // Stagger rows in
      let v = 0;
      const stagger = setInterval(() => {
        v++;
        setVisibleCount(v);
        if (v >= data.length) clearInterval(stagger);
      }, 50);

      // Start processing after rows appear
      const startDelay = data.length * 50 + 200;
      setTimeout(() => {
        let idx = 0;
        const speed = folderMode ? 200 : 400;
        const proc = setInterval(() => {
          setProcessedIndex(idx);
          idx++;
          if (idx >= data.length) {
            clearInterval(proc);
            setTimeout(() => {
              setAppState("complete");
              setProgressDone(true);
              setProgressGreen(true);
              setTimeout(() => setProgressGreen(false), 600);
              setTimeout(() => setProgressHidden(true), 1000);
              // Auto-expand a row
              if (folderMode) {
                setTimeout(() => setExpandedRow("g4"), 500);
              }
            }, 100);
          }
        }, speed);
        timerRef.current = proc;
      }, startDelay);
    }, 400);
  }, []);

  const clearAll = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    setAppState("empty");
    setFiles([]);
    setProcessedIndex(-1);
    setVisibleCount(0);
    setExpandedRow(null);
    setCollapsedGroups({});
    setProgressDone(false);
    setProgressGreen(false);
    setProgressHidden(true);
    setShowMoreTags(false);
  }, []);

  useEffect(() => {
    if (!autoStarted.current) {
      autoStarted.current = true;
      const t = setTimeout(() => startFlow(true), 1000);
      return () => clearTimeout(t);
    }
  }, [startFlow]);

  // Auto-scroll during processing
  useEffect(() => {
    if (processingRowRef.current && scrollRef.current) {
      processingRowRef.current.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }, [processedIndex]);

  const showToast = useCallback((text) => {
    setToast(text);
    setTimeout(() => setToast(null), 1700);
  }, []);

  const toggleGroup = (key) => {
    setCollapsedGroups(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const handleRowClick = (file, idx) => {
    if (idx > processedIndex) return;
    setExpandedRow(prev => prev === file.id ? null : file.id);
    setShowMoreTags(false);
  };

  const handleReveal = (e, file) => {
    e.stopPropagation();
    showToast(`Revealed ${file.name} in Finder`);
  };

  const handleRowDblClick = (file, idx) => {
    if (idx > processedIndex) return;
    showToast(`Revealed ${file.name} in Finder`);
  };

  const progressPct = totalFiles > 0 ? (completedCount / totalFiles) * 100 : 0;

  // Styles
  const fontBase = 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
  const fontMono = 'ui-monospace, "SF Mono", Menlo, Consolas, monospace';

  const renderMetadataPanel = (file) => {
    if (file.status === "error") {
      const errInfo = ERROR_DETAILS[file.after] || { title: "Error", detail: "", help: "" };
      return (
        <div style={{
          background: t.surface, borderTop: `1px solid ${t.border}`, padding: 16,
          animation: "expandIn 200ms ease-out",
        }}>
          <div style={{ color: t.error, fontSize: 14, fontWeight: 600, marginBottom: 8 }}>
            Error: {errInfo.title}
          </div>
          <div style={{ fontFamily: fontMono, fontSize: 12, color: t.muted, marginBottom: 8 }}>
            {errInfo.detail}
          </div>
          <div style={{ fontSize: 14, color: t.body, lineHeight: 1.4 }}>
            {errInfo.help}
          </div>
        </div>
      );
    }
    const meta = generateMetadata(file);
    if (!meta) return null;
    const defaultShow = 8;
    const visibleTags = showMoreTags ? meta.tags : meta.tags.slice(0, defaultShow);
    const moreCount = meta.tags.length - defaultShow;

    return (
      <div style={{
        background: t.surface, borderTop: `1px solid ${t.border}`, padding: 16,
        animation: "expandIn 200ms ease-out",
      }}>
        <div style={{
          display: "grid", gridTemplateColumns: "160px 1fr 1fr", gap: "4px 12px",
          fontFamily: fontMono, fontSize: 12, lineHeight: 1.4,
        }}>
          <div style={{ color: t.muted, fontWeight: 600 }}>Tag</div>
          <div style={{ color: t.muted, fontWeight: 600 }}>Before</div>
          <div style={{ color: t.muted, fontWeight: 600 }}>After</div>
          {visibleTags.map((tag, i) => (
            <React.Fragment key={i}>
              <div style={{ color: t.body, padding: "2px 0" }}>{tag.name}</div>
              <div style={{
                color: tag.removed ? t.strike : t.body,
                textDecoration: tag.removed ? "line-through" : "none",
                padding: "2px 0",
              }}>{tag.before}</div>
              <div style={{
                color: tag.removed ? t.muted : t.preserved,
                padding: "2px 0", fontStyle: tag.removed ? "italic" : "normal",
              }}>
                {tag.removed ? "(removed)" : tag.before}
              </div>
            </React.Fragment>
          ))}
        </div>
        {!showMoreTags && moreCount > 0 && (
          <button onClick={(e) => { e.stopPropagation(); setShowMoreTags(true); }}
            style={{
              background: "none", border: "none", color: t.burgundy, fontSize: 12,
              fontFamily: fontMono, cursor: "pointer", padding: "8px 0 4px",
              textDecoration: "underline", textUnderlineOffset: 2,
            }}>
            ... {moreCount} more tags
          </button>
        )}
        <div style={{
          marginTop: 12, paddingTop: 8, borderTop: `1px solid ${t.border}`,
          fontSize: 12, color: t.muted,
        }}>
          {meta.examined} tags examined · {meta.removed} removed · {meta.preserved} preserved
        </div>
      </div>
    );
  };

  const renderFileRow = (file, fileIdx, indent = false) => {
    const globalIdx = files.indexOf(file);
    const isProcessed = globalIdx <= processedIndex;
    const isProcessing = globalIdx === processedIndex + 1 && appState === "processing";
    const isPending = globalIdx > processedIndex + 1 || (globalIdx > processedIndex && appState !== "processing");
    const isExpanded = expandedRow === file.id;
    const isHovered = hoveredRow === file.id;
    const isVisible = globalIdx < visibleCount;
    const isClickable = isProcessed;
    const isCurrentlyProcessing = appState === "processing" && globalIdx === processedIndex + 1;

    if (!isVisible) return null;

    let statusIcon = null;
    let rowBg = "transparent";
    if (isProcessed && file.status === "success") {
      statusIcon = <span style={{ color: t.success, fontSize: 14 }}>✓</span>;
    } else if (isProcessed && file.status === "error") {
      statusIcon = <span style={{ color: t.error, fontSize: 14 }}>✗</span>;
      rowBg = t.errorBg;
    } else if (isCurrentlyProcessing) {
      statusIcon = (
        <span style={{
          display: "inline-block", width: 12, height: 12, border: `2px solid ${t.gold}`,
          borderTopColor: "transparent", borderRadius: "50%",
          animation: "spin 600ms linear infinite",
        }} />
      );
    } else {
      statusIcon = <span style={{ color: t.muted, fontSize: 10 }}>●</span>;
    }

    if (isHovered && isClickable) rowBg = t.hover;
    if (isExpanded) rowBg = t.hover;

    return (
      <React.Fragment key={file.id}>
        <div
          ref={isCurrentlyProcessing ? processingRowRef : null}
          onClick={() => handleRowClick(file, globalIdx)}
          onDoubleClick={() => handleRowDblClick(file, globalIdx)}
          onMouseEnter={() => setHoveredRow(file.id)}
          onMouseLeave={() => setHoveredRow(null)}
          style={{
            display: "grid",
            gridTemplateColumns: indent ? "12px 20px 1fr 60px 80px 24px" : "20px 1fr 60px 80px 24px",
            alignItems: "center",
            padding: "8px 12px",
            fontSize: 14,
            color: t.body,
            background: rowBg,
            cursor: isClickable ? "pointer" : "default",
            transition: "background 100ms ease-out",
            borderBottom: `1px solid ${dark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.04)"}`,
            animation: `fadeSlideIn 150ms ease-out`,
            animationFillMode: "backwards",
            animationDelay: `${fileIdx * 50}ms`,
          }}
        >
          {indent && <div />}
          <div style={{ display: "flex", justifyContent: "center" }}>{statusIcon}</div>
          <div style={{
            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
            fontFamily: fontBase, color: file.status === "error" && isProcessed ? t.error : t.body,
          }}>
            {file.name}
          </div>
          <div style={{ textAlign: "right", fontFamily: fontMono, fontSize: 12, color: t.muted }}>
            {isProcessed ? (file.before !== null ? file.before : "—") : "—"}
          </div>
          <div style={{
            textAlign: "right", fontFamily: fontMono, fontSize: 12,
            color: isProcessed
              ? (file.status === "error" ? t.error : (file.after === 0 ? t.success : t.muted))
              : t.muted,
          }}>
            {isProcessed
              ? (file.status === "error" ? file.after : file.after)
              : (isCurrentlyProcessing ? "..." : "—")}
          </div>
          <div style={{ display: "flex", justifyContent: "center" }}>
            {isHovered && isClickable && (
              <button
                onClick={(e) => handleReveal(e, file)}
                style={{
                  background: "none", border: "none", cursor: "pointer",
                  color: t.muted, fontSize: 13, padding: 0, lineHeight: 1,
                  opacity: 0.7, transition: "opacity 100ms",
                }}
                onMouseEnter={e => e.currentTarget.style.opacity = 1}
                onMouseLeave={e => e.currentTarget.style.opacity = 0.7}
                title="Reveal in Finder"
              >↗</button>
            )}
          </div>
        </div>
        {isExpanded && renderMetadataPanel(file)}
      </React.Fragment>
    );
  };

  const renderGroupedTable = () => {
    if (!groups) return files.map((f, i) => renderFileRow(f, i, false));
    let fileIdx = 0;
    return groups.map(group => {
      const isCollapsed = collapsedGroups[group.key];
      const count = group.files.length;
      const items = group.files.map(f => {
        const row = renderFileRow(f, fileIdx, true);
        fileIdx++;
        return row;
      });
      return (
        <React.Fragment key={group.key}>
          <div
            onClick={() => toggleGroup(group.key)}
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 24px",
              alignItems: "center",
              padding: "6px 12px",
              background: t.groupBg,
              cursor: "pointer",
              fontSize: 14,
              fontWeight: 600,
              color: t.body,
              borderBottom: `1px solid ${t.border}`,
              userSelect: "none",
            }}
          >
            <div>
              <span style={{ marginRight: 6 }}>📁</span>
              {group.label === "Individual files" ? "Individual files" : group.label}
              <span style={{ fontWeight: 400, color: t.muted, marginLeft: 8, fontSize: 12 }}>
                ({count} file{count !== 1 ? "s" : ""})
              </span>
            </div>
            <div style={{
              fontSize: 11, color: t.muted, transition: "transform 200ms ease-out",
              transform: isCollapsed ? "rotate(-90deg)" : "rotate(0deg)",
              textAlign: "center",
            }}>▼</div>
          </div>
          {!isCollapsed && items}
        </React.Fragment>
      );
    });
  };

  const showFooter = appState === "processing" || appState === "complete";
  const showProgress = !progressHidden && (appState === "processing" || appState === "complete");

  return (
    <div style={{
      width: 580, height: 460, margin: "20px auto",
      borderRadius: 8, overflow: "hidden",
      border: `1px solid ${t.border}`,
      boxShadow: dark ? "0 8px 32px rgba(0,0,0,0.5)" : "0 8px 32px rgba(0,0,0,0.16)",
      fontFamily: fontBase, display: "flex", flexDirection: "column",
      background: t.bg, color: t.body, position: "relative",
    }}>
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes fadeSlideIn {
          from { opacity: 0; transform: translateY(6px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes expandIn {
          from { opacity: 0; max-height: 0; }
          to { opacity: 1; max-height: 500px; }
        }
        @keyframes toastIn {
          from { opacity: 0; transform: translateY(4px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes checkPop {
          0% { transform: scale(0); }
          70% { transform: scale(1.2); }
          100% { transform: scale(1); }
        }
        @media (prefers-reduced-motion: reduce) {
          *, *::before, *::after {
            animation-duration: 0.01ms !important;
            transition-duration: 0.01ms !important;
          }
        }
        .ec-scroll::-webkit-scrollbar { width: 6px; }
        .ec-scroll::-webkit-scrollbar-track { background: transparent; }
        .ec-scroll::-webkit-scrollbar-thumb {
          background: ${t.muted}44; border-radius: 3px;
        }
        .ec-scroll::-webkit-scrollbar-thumb:hover {
          background: ${t.muted}88;
        }
      `}</style>

      {/* Title Bar */}
      <div style={{
        height: 38, background: t.chrome, display: "flex", alignItems: "center",
        padding: "0 12px", flexShrink: 0, borderBottom: `1px solid ${t.border}`,
        position: "relative",
      }}>
        <div style={{ display: "flex", gap: 8 }}>
          {[["#FF5F57"], ["#FFBD2E"], ["#27C93F"]].map(([c], i) => (
            <div key={i} style={{
              width: 12, height: 12, borderRadius: "50%", background: c,
            }} />
          ))}
        </div>
        <div style={{
          position: "absolute", left: "50%", transform: "translateX(-50%)",
          fontSize: 13, color: t.muted, fontWeight: 500, userSelect: "none",
        }}>ExifCleaner</div>
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8 }}>
          <button onClick={() => setShowSettings(true)} style={{
            background: "none", border: "none", cursor: "pointer",
            fontSize: 15, color: t.muted, padding: "2px 4px", lineHeight: 1,
          }} title="Settings">⚙</button>
          <button onClick={() => setDark(!dark)} style={{
            background: "none", border: "none", cursor: "pointer",
            fontSize: 15, color: t.muted, padding: "2px 4px", lineHeight: 1,
          }} title="Toggle dark mode">{dark ? "☀" : "☽"}</button>
        </div>
      </div>

      {/* Progress Bar */}
      <div style={{ height: 3, background: showProgress ? (dark ? t.border + "44" : t.border + "66") : "transparent", flexShrink: 0, position: "relative", overflow: "hidden" }}>
        {showProgress && (
          <div style={{
            height: "100%",
            width: `${progressPct}%`,
            background: progressGreen ? t.success : t.gold,
            transition: "width 300ms ease-out, background 300ms ease-out",
            borderRadius: "0 2px 2px 0",
          }} />
        )}
      </div>

      {/* Counter */}
      {(appState === "processing" || appState === "complete") && (
        <div style={{
          padding: "4px 12px 2px", fontSize: 12, color: progressDone ? t.success : t.muted,
          textAlign: "right", flexShrink: 0, fontFamily: fontMono,
        }}>
          {completedCount} of {totalFiles}{progressDone ? ` — ${errorCount > 0 ? "Done" : "All clean"}` : ""}
        </div>
      )}

      {/* Main Content */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
        {appState === "empty" && (
          <div style={{
            flex: 1, display: "flex", alignItems: "center", justifyContent: "center",
            padding: 32,
          }}>
            <div style={{
              border: `2px dashed ${t.secondary}`, borderRadius: 8,
              padding: "48px 40px", textAlign: "center", width: "100%",
              maxWidth: 400,
            }}>
              <svg width="48" height="48" viewBox="0 0 48 48" fill="none" style={{ margin: "0 auto 16px", display: "block" }}>
                <rect x="6" y="10" width="28" height="28" rx="3" stroke={t.muted} strokeWidth="2" fill="none" />
                <rect x="14" y="10" width="28" height="28" rx="3" stroke={t.muted} strokeWidth="2" fill={t.surface} />
                <circle cx="23" cy="21" r="3" stroke={t.muted} strokeWidth="1.5" fill="none" />
                <path d="M14 32 L22 24 L28 30 L32 26 L42 34" stroke={t.muted} strokeWidth="1.5" fill="none" />
              </svg>
              <div style={{ color: t.secondary, fontSize: 16, marginBottom: 20, lineHeight: 1.5 }}>
                Drop files here to<br />remove metadata
              </div>
              <div style={{ display: "flex", gap: 24, justifyContent: "center" }}>
                <button onClick={() => startFlow(false)} style={{
                  background: "none", border: "none", color: t.muted, fontSize: 14,
                  cursor: "pointer", textDecoration: "none", padding: "4px 0",
                  borderBottom: `1px solid transparent`,
                }} onMouseEnter={e => e.currentTarget.style.borderBottomColor = t.muted}
                   onMouseLeave={e => e.currentTarget.style.borderBottomColor = "transparent"}>
                  Add files
                </button>
                <button onClick={() => startFlow(true)} style={{
                  background: "none", border: "none", color: t.muted, fontSize: 14,
                  cursor: "pointer", textDecoration: "none", padding: "4px 0",
                  borderBottom: `1px solid transparent`,
                }} onMouseEnter={e => e.currentTarget.style.borderBottomColor = t.muted}
                   onMouseLeave={e => e.currentTarget.style.borderBottomColor = "transparent"}>
                  Add folder
                </button>
              </div>
            </div>
          </div>
        )}

        {appState === "dragover" && (
          <div style={{
            flex: 1, display: "flex", alignItems: "center", justifyContent: "center",
            padding: 32, background: `${t.gold}0D`,
          }}>
            <div style={{
              border: `2px dashed ${t.gold}`, borderRadius: 8,
              padding: "48px 40px", textAlign: "center", width: "100%", maxWidth: 400,
            }}>
              <svg width="48" height="48" viewBox="0 0 48 48" fill="none" style={{ margin: "0 auto 16px", display: "block" }}>
                <rect x="6" y="10" width="28" height="28" rx="3" stroke={t.gold} strokeWidth="2" fill="none" />
                <rect x="14" y="10" width="28" height="28" rx="3" stroke={t.gold} strokeWidth="2" fill={t.surface} />
              </svg>
              <div style={{ color: t.gold, fontSize: 16, fontWeight: 600 }}>
                Release to clean
              </div>
            </div>
          </div>
        )}

        {(appState === "processing" || appState === "complete") && (
          <>
            {/* Sticky Header */}
            <div style={{
              display: "grid",
              gridTemplateColumns: isFolder ? "12px 20px 1fr 60px 80px 24px" : "20px 1fr 60px 80px 24px",
              padding: "8px 12px",
              fontSize: 12,
              fontWeight: 600,
              color: t.secondary,
              borderBottom: `1px solid ${t.border}`,
              background: t.surface,
              flexShrink: 0,
              position: "sticky",
              top: 0,
              zIndex: 2,
            }}>
              {isFolder && <div />}
              <div />
              <div>Filename</div>
              <div style={{ textAlign: "right" }}>Before</div>
              <div style={{ textAlign: "right" }}>After</div>
              <div />
            </div>
            {/* Scrollable table */}
            <div ref={scrollRef} className="ec-scroll" style={{
              flex: 1, overflowY: "auto", overflowX: "hidden",
            }}>
              {renderGroupedTable()}
            </div>
          </>
        )}
      </div>

      {/* Footer */}
      {showFooter && (
        <div style={{
          height: 32, background: t.chrome, borderTop: `1px solid ${t.border}`,
          display: "flex", alignItems: "center", justifyContent: "flex-end",
          padding: "0 12px", flexShrink: 0,
        }}>
          <button onClick={clearAll} style={{
            background: "none", border: "none", color: t.muted, fontSize: 12,
            cursor: "pointer", fontFamily: fontBase,
          }}>
            Clear <span style={{ fontSize: 11, opacity: 0.7 }}>⌘K</span>
          </button>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div style={{
          position: "absolute", bottom: 48, left: "50%", transform: "translateX(-50%)",
          background: t.surface, border: `1px solid ${t.border}`,
          boxShadow: dark ? "0 4px 16px rgba(0,0,0,0.4)" : "0 1px 3px rgba(0,0,0,0.08)",
          borderRadius: 6, padding: "6px 12px", fontSize: 12, color: t.body,
          display: "flex", alignItems: "center", gap: 6,
          animation: "toastIn 100ms ease-out", zIndex: 10, whiteSpace: "nowrap",
        }}>
          <span>📂</span> {toast}
        </div>
      )}

      {/* Settings Modal */}
      {showSettings && (
        <div
          onClick={() => setShowSettings(false)}
          style={{
            position: "absolute", inset: 0, background: "rgba(0,0,0,0.3)",
            display: "flex", alignItems: "center", justifyContent: "center",
            zIndex: 20,
          }}
        >
          <div onClick={e => e.stopPropagation()} style={{
            width: 320, background: t.surface, borderRadius: 8,
            boxShadow: dark ? "0 4px 16px rgba(0,0,0,0.4)" : "0 4px 16px rgba(0,0,0,0.12)",
            padding: 24,
          }}>
            <div style={{ fontSize: 20, fontWeight: 500, color: t.heading, marginBottom: 20 }}>
              Settings
            </div>
            {[
              { key: "orientation", label: "Preserve image orientation", sub: null },
              { key: "keepOriginal", label: "Keep original files", sub: "Saves cleaned copies as filename_cleaned.ext" },
              { key: "timestamps", label: "Preserve file timestamps", sub: null },
            ].map(opt => (
              <label key={opt.key} style={{
                display: "flex", alignItems: "flex-start", gap: 10, marginBottom: 14,
                cursor: "pointer", fontSize: 14, color: t.body,
              }}>
                <input
                  type="checkbox"
                  checked={settings[opt.key]}
                  onChange={() => setSettings(s => ({ ...s, [opt.key]: !s[opt.key] }))}
                  style={{ accentColor: t.burgundy, marginTop: 2, cursor: "pointer" }}
                />
                <div>
                  {opt.label}
                  {opt.sub && <div style={{ fontSize: 12, color: t.muted, marginTop: 2 }}>{opt.sub}</div>}
                </div>
              </label>
            ))}
            <div style={{ marginTop: 20, textAlign: "right" }}>
              <button onClick={() => setShowSettings(false)} style={{
                background: t.gold, color: "#1E2028", border: "none",
                borderRadius: 4, padding: "8px 20px", fontSize: 14,
                fontWeight: 600, cursor: "pointer",
              }}>Done</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
