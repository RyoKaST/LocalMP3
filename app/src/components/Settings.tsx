import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { check } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";
import { getVersion } from "@tauri-apps/api/app";
import { Track } from "../types";

function hexToHsv(hex: string): [number, number, number] {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const d = max - min;
  let h = 0;
  if (d !== 0) {
    if (max === r) h = ((g - b) / d + 6) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
  }
  const s = max === 0 ? 0 : d / max;
  return [h, s, max];
}

function hsvToHex(h: number, s: number, v: number): string {
  const c = v * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = v - c;
  let r = 0, g = 0, b = 0;
  if (h < 60) { r = c; g = x; }
  else if (h < 120) { r = x; g = c; }
  else if (h < 180) { g = c; b = x; }
  else if (h < 240) { g = x; b = c; }
  else if (h < 300) { r = x; b = c; }
  else { r = c; b = x; }
  const toHex = (n: number) => Math.round((n + m) * 255).toString(16).padStart(2, "0");
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

export type PlaylistDeleteBehavior = "find-playlist" | "library" | "stop";
export type LibraryClickBehavior = "songs" | "albums" | "keep";
export type FullscreenLayout = "side-by-side" | "cover" | "karaoke";
export type FullscreenBackground = "blurred-cover" | "color-gradient" | "dark-accent";
export type FullscreenControls = "full" | "minimal" | "auto-hide";

interface SettingsProps {
  accentColor: string;
  theme: "dark" | "light";
  libraryPaths: string[];
  tracks: Track[];
  playlistDeleteBehavior: PlaylistDeleteBehavior;
  lyricsCloseOnClickOutside: boolean;
  libraryClickBehavior: LibraryClickBehavior;
  onAccentChange: (color: string) => void;
  onThemeChange: (theme: "dark" | "light") => void;
  onAddFolder: () => void;
  onRemoveFolder: (path: string) => void;
  onRefreshLibrary: () => void;
  onDeleteTrack: (trackPath: string) => void;
  onPlaylistDeleteBehaviorChange: (behavior: PlaylistDeleteBehavior) => void;
  onLyricsCloseOnClickOutsideChange: (value: boolean) => void;
  onLibraryClickBehaviorChange: (behavior: LibraryClickBehavior) => void;
  fullscreenLayout: FullscreenLayout;
  fullscreenBackground: FullscreenBackground;
  fullscreenControls: FullscreenControls;
  onFullscreenLayoutChange: (layout: FullscreenLayout) => void;
  onFullscreenBackgroundChange: (bg: FullscreenBackground) => void;
  onFullscreenControlsChange: (controls: FullscreenControls) => void;
  updateAvailable?: boolean;
}

const ACCENT_PRESETS = [
  { name: "Green", value: "#1db954" },
  { name: "Blue", value: "#1d8feb" },
  { name: "Purple", value: "#8b5cf6" },
  { name: "Pink", value: "#e91e8a" },
  { name: "Red", value: "#e53e3e" },
  { name: "Orange", value: "#ed8936" },
  { name: "Yellow", value: "#ecc94b" },
  { name: "Teal", value: "#38b2ac" },
];

type Tab = "appearances" | "directories" | "experience" | "duplicates" | "updates";

function getParentDir(filePath: string, libraryPaths: string[]): string {
  for (const lp of libraryPaths) {
    if (filePath.startsWith(lp)) return lp;
  }
  const sep = filePath.includes("/") ? "/" : "\\";
  return filePath.substring(0, filePath.lastIndexOf(sep));
}

function formatDuration(secs: number): string {
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function ColorPicker({ color, onChange }: { color: string; onChange: (c: string) => void }) {
  const [hsv, setHsv] = useState(() => hexToHsv(color));
  const [expanded, setExpanded] = useState(false);
  const svRef = useRef<HTMLDivElement>(null);
  const hueRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef<"sv" | "hue" | null>(null);

  const lastExternal = useRef(color);
  if (color !== lastExternal.current) {
    lastExternal.current = color;
    const newHsv = hexToHsv(color);
    if (hsvToHex(...hsv) !== color) {
      setHsv(newHsv);
    }
  }

  const applyHsv = useCallback((h: number, s: number, v: number) => {
    setHsv([h, s, v]);
    const hex = hsvToHex(h, s, v);
    lastExternal.current = hex;
    onChange(hex);
  }, [onChange]);

  const handleSvMove = useCallback((e: MouseEvent | React.MouseEvent) => {
    const rect = svRef.current?.getBoundingClientRect();
    if (!rect) return;
    const s = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const v = Math.max(0, Math.min(1, 1 - (e.clientY - rect.top) / rect.height));
    applyHsv(hsv[0], s, v);
  }, [hsv, applyHsv]);

  const handleHueMove = useCallback((e: MouseEvent | React.MouseEvent) => {
    const rect = hueRef.current?.getBoundingClientRect();
    if (!rect) return;
    const h = Math.max(0, Math.min(360, ((e.clientX - rect.left) / rect.width) * 360));
    applyHsv(h, hsv[1], hsv[2]);
  }, [hsv, applyHsv]);

  const handleMouseUp = useCallback(() => {
    draggingRef.current = null;
    window.removeEventListener("mousemove", handleGlobalMove);
    window.removeEventListener("mouseup", handleMouseUp);
  }, []);

  const handleGlobalMove = useCallback((e: MouseEvent) => {
    if (draggingRef.current === "sv") handleSvMove(e);
    else if (draggingRef.current === "hue") handleHueMove(e);
  }, [handleSvMove, handleHueMove]);

  const startDrag = useCallback((type: "sv" | "hue", e: React.MouseEvent) => {
    draggingRef.current = type;
    if (type === "sv") handleSvMove(e);
    else handleHueMove(e);
    window.addEventListener("mousemove", handleGlobalMove);
    window.addEventListener("mouseup", handleMouseUp);
  }, [handleSvMove, handleHueMove, handleGlobalMove, handleMouseUp]);

  return (
    <div className="color-picker">
      <button className="color-picker-toggle" onClick={() => setExpanded(!expanded)}>
        <span className="color-picker-preview" style={{ background: color }} />
        Custom
        <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"
          style={{ transform: expanded ? "rotate(180deg)" : "none", transition: "transform 0.2s" }}>
          <path d="M7.41 8.59L12 13.17l4.59-4.58L18 10l-6 6-6-6z" />
        </svg>
      </button>
      {expanded && (
        <div className="color-picker-panel">
          <div
            className="color-picker-sv"
            ref={svRef}
            style={{ background: `hsl(${hsv[0]}, 100%, 50%)` }}
            onMouseDown={(e) => startDrag("sv", e)}
          >
            <div className="color-picker-sv-white" />
            <div className="color-picker-sv-black" />
            <div
              className="color-picker-sv-cursor"
              style={{ left: `${hsv[1] * 100}%`, top: `${(1 - hsv[2]) * 100}%` }}
            />
          </div>
          <div
            className="color-picker-hue"
            ref={hueRef}
            onMouseDown={(e) => startDrag("hue", e)}
          >
            <div
              className="color-picker-hue-cursor"
              style={{ left: `${(hsv[0] / 360) * 100}%` }}
            />
          </div>
          <div className="color-picker-hex">
            <span className="color-picker-hex-label">#</span>
            <input
              className="color-picker-hex-input"
              value={color.slice(1)}
              maxLength={6}
              onChange={(e) => {
                const v = e.target.value.replace(/[^0-9a-fA-F]/g, "").slice(0, 6);
                if (v.length === 6) {
                  const hex = `#${v}`;
                  onChange(hex);
                  setHsv(hexToHsv(hex));
                  lastExternal.current = hex;
                }
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
}

interface DupeGroup {
  key: string;
  title: string;
  artist: string;
  tracks: (Track & { directory: string })[];
}

interface ProbableDupeGroup {
  title: string;
  tracks: (Track & { directory: string })[];
}

function AppVersion() {
  const [version, setVersion] = useState("");
  useEffect(() => {
    getVersion().then(setVersion);
  }, []);
  return version ? (
    <p className="settings-description" style={{ opacity: 0.7 }}>
      Current version: {version}
    </p>
  ) : null;
}

function UpdateChecker({ updateAvailable }: { updateAvailable?: boolean }) {
  const [status, setStatus] = useState<"idle" | "checking" | "available" | "downloading" | "ready" | "up-to-date" | "error">(
    updateAvailable ? "checking" : "idle"
  );
  const [version, setVersion] = useState("");
  const [progress, setProgress] = useState(0);
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    if (updateAvailable) checkForUpdate();
  }, []);

  async function checkForUpdate() {
    setStatus("checking");
    setErrorMsg("");
    try {
      const update = await check();
      if (update) {
        setVersion(update.version);
        setStatus("available");
      } else {
        setStatus("up-to-date");
      }
    } catch (e) {
      setErrorMsg(String(e));
      setStatus("error");
    }
  }

  async function downloadAndInstall() {
    setStatus("downloading");
    try {
      const update = await check();
      if (!update) return;
      let totalLen = 0;
      let downloaded = 0;
      await update.downloadAndInstall((event) => {
        if (event.event === "Started" && event.data.contentLength) {
          totalLen = event.data.contentLength;
        } else if (event.event === "Progress") {
          downloaded += event.data.chunkLength;
          if (totalLen > 0) setProgress(Math.round((downloaded / totalLen) * 100));
        } else if (event.event === "Finished") {
          setStatus("ready");
        }
      });
      setStatus("ready");
    } catch (e) {
      setErrorMsg(String(e));
      setStatus("error");
    }
  }

  async function restart() {
    await relaunch();
  }

  return (
    <div className="settings-update">
      {status === "idle" && (
        <button className="settings-update-btn" onClick={checkForUpdate}>
          Check for updates
        </button>
      )}
      {status === "checking" && (
        <span className="settings-update-status">Checking for updates...</span>
      )}
      {status === "up-to-date" && (
        <span className="settings-update-status">You're up to date!</span>
      )}
      {status === "available" && (
        <div className="settings-update-available">
          <span className="settings-update-status">Version {version} is available</span>
          <button className="settings-update-btn" onClick={downloadAndInstall}>
            Download & Install
          </button>
        </div>
      )}
      {status === "downloading" && (
        <div className="settings-update-progress">
          <span className="settings-update-status">Downloading... {progress}%</span>
          <div className="settings-update-bar">
            <div className="settings-update-bar-fill" style={{ width: `${progress}%` }} />
          </div>
        </div>
      )}
      {status === "ready" && (
        <div className="settings-update-available">
          <span className="settings-update-status">Update installed!</span>
          <button className="settings-update-btn" onClick={restart}>
            Restart now
          </button>
        </div>
      )}
      {status === "error" && (
        <div className="settings-update-available">
          <span className="settings-update-status settings-update-error">{errorMsg}</span>
          <button className="settings-update-btn" onClick={checkForUpdate}>
            Retry
          </button>
        </div>
      )}
    </div>
  );
}

export default function Settings({
  accentColor,
  theme,
  libraryPaths,
  tracks,
  onAccentChange,
  onThemeChange,
  onAddFolder,
  onRemoveFolder,
  onRefreshLibrary,
  onDeleteTrack,
  playlistDeleteBehavior,
  onPlaylistDeleteBehaviorChange,
  lyricsCloseOnClickOutside,
  onLyricsCloseOnClickOutsideChange,
  libraryClickBehavior,
  onLibraryClickBehaviorChange,
  fullscreenLayout,
  fullscreenBackground,
  fullscreenControls,
  onFullscreenLayoutChange,
  onFullscreenBackgroundChange,
  onFullscreenControlsChange,
  updateAvailable,
}: SettingsProps) {
  const [activeTab, setActiveTab] = useState<Tab>("directories");
  const [searchQuery, setSearchQuery] = useState("");
  const [confirmingDelete, setConfirmingDelete] = useState<string | null>(null);

  const isSearching = searchQuery.trim().length > 0;
  const q = searchQuery.toLowerCase();
  const matchesSearch = (...keywords: string[]) =>
    keywords.some((k) => k.toLowerCase().includes(q));

  const dupeGroups = useMemo<DupeGroup[]>(() => {
    const map = new Map<string, (Track & { directory: string })[]>();
    for (const track of tracks) {
      const dir = getParentDir(track.path, libraryPaths);
      const key = `${track.title.toLowerCase()}::${track.artist.toLowerCase()}`;
      const entry = map.get(key) || [];
      entry.push({ ...track, directory: dir });
      map.set(key, entry);
    }
    const groups: DupeGroup[] = [];
    for (const [key, entries] of map) {
      const dirs = new Set(entries.map((e) => e.directory));
      if (dirs.size >= 2) {
        groups.push({
          key,
          title: entries[0].title,
          artist: entries[0].artist,
          tracks: entries,
        });
      }
    }
    groups.sort((a, b) => a.title.toLowerCase().localeCompare(b.title.toLowerCase()));
    return groups;
  }, [tracks, libraryPaths]);

  const probableDupes = useMemo<ProbableDupeGroup[]>(() => {
    if (libraryPaths.length < 2) return [];

    const IGNORED = new Set(["unknown", ""]);
    const exactKeys = new Set(dupeGroups.map((g) => g.key));

    const byTitle = new Map<string, (Track & { directory: string })[]>();
    for (const track of tracks) {
      const title = track.title.toLowerCase();
      if (IGNORED.has(title)) continue;
      const dir = getParentDir(track.path, libraryPaths);
      const arr = byTitle.get(title) || [];
      arr.push({ ...track, directory: dir });
      byTitle.set(title, arr);
    }

    const results: ProbableDupeGroup[] = [];
    for (const [title, entries] of byTitle) {
      const dirs = new Set(entries.map((e) => e.directory));
      if (dirs.size < 2) continue;

      const byArtist = new Map<string, typeof entries>();
      for (const e of entries) {
        const key = `${title}::${e.artist.toLowerCase()}`;
        const arr = byArtist.get(key) || [];
        arr.push(e);
        byArtist.set(key, arr);
      }
      if ([...byArtist.keys()].every((k) => exactKeys.has(k)) && byArtist.size === 1) continue;

      results.push({ title: entries[0].title, tracks: entries });
    }

    results.sort((a, b) => a.title.toLowerCase().localeCompare(b.title.toLowerCase()));
    return results;
  }, [tracks, libraryPaths, dupeGroups]);

  const totalDupeCount = dupeGroups.length + probableDupes.length;

  return (
    <div className="settings">
      <div className="settings-header">
        <h1 className="settings-title">Settings</h1>
      </div>

      <div className="settings-search">
        <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" className="settings-search-icon">
          <path d="M15.5 14h-.79l-.28-.27C15.41 12.59 16 11.11 16 9.5 16 5.91 13.09 3 9.5 3S3 5.91 3 9.5 5.91 16 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z" />
        </svg>
        <input
          className="settings-search-input"
          type="text"
          placeholder="Search settings..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
        {isSearching && (
          <button className="settings-search-clear" onClick={() => setSearchQuery("")}>
            <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor">
              <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
            </svg>
          </button>
        )}
      </div>

      {!isSearching && (
      <div className="settings-tabs">
        <button
          className={`settings-tab ${activeTab === "directories" ? "active" : ""}`}
          onClick={() => setActiveTab("directories")}
        >
          Directories
        </button>
        <button
          className={`settings-tab ${activeTab === "appearances" ? "active" : ""}`}
          onClick={() => setActiveTab("appearances")}
        >
          Appearances
        </button>
        <button
          className={`settings-tab ${activeTab === "experience" ? "active" : ""}`}
          onClick={() => setActiveTab("experience")}
        >
          Experience
        </button>
        <button
          className={`settings-tab ${activeTab === "duplicates" ? "active" : ""}`}
          onClick={() => setActiveTab("duplicates")}
        >
          Duplicates
          {totalDupeCount > 0 && (
            <span className="settings-tab-badge">{totalDupeCount}</span>
          )}
        </button>
        <button
          className={`settings-tab ${activeTab === "updates" ? "active" : ""}`}
          onClick={() => setActiveTab("updates")}
        >
          Updates
          {updateAvailable && <span className="settings-tab-dot" />}
        </button>
      </div>
      )}

      <div className="settings-content">
        {(activeTab === "appearances" || isSearching) && (
          <div className="settings-section">
            {(!isSearching || matchesSearch("theme", "dark", "light", "appearance")) && (
            <div className="settings-group">
              <h3 className="settings-group-title">Theme</h3>
              <div className="settings-theme-toggle">
                <button
                  className={`settings-theme-btn ${theme === "dark" ? "active" : ""}`}
                  onClick={() => onThemeChange("dark")}
                >
                  <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
                    <path d="M12 3c-4.97 0-9 4.03-9 9s4.03 9 9 9 9-4.03 9-9c0-.46-.04-.92-.1-1.36-.98 1.37-2.58 2.26-4.4 2.26-2.98 0-5.4-2.42-5.4-5.4 0-1.81.89-3.42 2.26-4.4-.44-.06-.9-.1-1.36-.1z" />
                  </svg>
                  Dark
                </button>
                <button
                  className={`settings-theme-btn ${theme === "light" ? "active" : ""}`}
                  onClick={() => onThemeChange("light")}
                >
                  <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
                    <path d="M12 7c-2.76 0-5 2.24-5 5s2.24 5 5 5 5-2.24 5-5-2.24-5-5-5zM2 13h2c.55 0 1-.45 1-1s-.45-1-1-1H2c-.55 0-1 .45-1 1s.45 1 1 1zm18 0h2c.55 0 1-.45 1-1s-.45-1-1-1h-2c-.55 0-1 .45-1 1s.45 1 1 1zM11 2v2c0 .55.45 1 1 1s1-.45 1-1V2c0-.55-.45-1-1-1s-1 .45-1 1zm0 18v2c0 .55.45 1 1 1s1-.45 1-1v-2c0-.55-.45-1-1-1s-1 .45-1 1zM5.99 4.58c-.39-.39-1.03-.39-1.41 0-.39.39-.39 1.03 0 1.41l1.06 1.06c.39.39 1.03.39 1.41 0s.39-1.03 0-1.41L5.99 4.58zm12.37 12.37c-.39-.39-1.03-.39-1.41 0-.39.39-.39 1.03 0 1.41l1.06 1.06c.39.39 1.03.39 1.41 0 .39-.39.39-1.03 0-1.41l-1.06-1.06zm1.06-10.96c.39-.39.39-1.03 0-1.41-.39-.39-1.03-.39-1.41 0l-1.06 1.06c-.39.39-.39 1.03 0 1.41s1.03.39 1.41 0l1.06-1.06zM7.05 18.36c.39-.39.39-1.03 0-1.41-.39-.39-1.03-.39-1.41 0l-1.06 1.06c-.39.39-.39 1.03 0 1.41s1.03.39 1.41 0l1.06-1.06z" />
                  </svg>
                  Light
                </button>
              </div>
            </div>
            )}

            {(!isSearching || matchesSearch("accent", "color", "appearance")) && (
            <div className="settings-group">
              <h3 className="settings-group-title">Accent Color</h3>
              <div className="settings-colors">
                {ACCENT_PRESETS.map((preset) => (
                  <button
                    key={preset.value}
                    className={`settings-color-btn ${accentColor === preset.value ? "active" : ""}`}
                    style={{ "--swatch": preset.value } as React.CSSProperties}
                    onClick={() => onAccentChange(preset.value)}
                    title={preset.name}
                  >
                    <span className="settings-color-swatch" />
                    <span className="settings-color-name">{preset.name}</span>
                  </button>
                ))}
              </div>
              <ColorPicker color={accentColor} onChange={onAccentChange} />
            </div>
            )}
          </div>
        )}

        {(activeTab === "directories" || isSearching) && (!isSearching || matchesSearch("directories", "folder", "music", "library", "path", "scan")) && (
          <div className="settings-section">
            <div className="settings-group">
              <h3 className="settings-group-title">Music Directories</h3>
              <p className="settings-description">
                Add folders containing your music files. Subfolders are scanned automatically.
              </p>
              <div className="settings-directories">
                {libraryPaths.map((path) => (
                  <div key={path} className="settings-directory">
                    <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" className="settings-directory-icon">
                      <path d="M10 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z" />
                    </svg>
                    <span className="settings-directory-path">{path}</span>
                    <button
                      className="settings-directory-remove"
                      onClick={() => onRemoveFolder(path)}
                      title="Remove directory"
                    >
                      <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
                        <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
                      </svg>
                    </button>
                  </div>
                ))}
                {libraryPaths.length === 0 && (
                  <div className="settings-directory-empty">
                    No directories added yet.
                  </div>
                )}
              </div>
              <div className="settings-dir-actions">
                <button className="settings-add-dir-btn" onClick={onAddFolder}>
                  <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
                    <path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z" />
                  </svg>
                  Add Directory
                </button>
                {libraryPaths.length > 0 && (
                  <button className="settings-refresh-btn" onClick={onRefreshLibrary}>
                    <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
                      <path d="M17.65 6.35C16.2 4.9 14.21 4 12 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08c-.82 2.33-3.04 4-5.65 4-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z" />
                    </svg>
                    Refresh
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        {(activeTab === "experience" || isSearching) && (
          <div className="settings-section">
            {(!isSearching || matchesSearch("playlist", "deletion", "delete")) && (
            <div className="settings-group">
              <h3 className="settings-group-title">Playlist Deletion</h3>
              <p className="settings-description">
                What should happen to the currently playing track when its playlist is deleted?
              </p>
              <div className="settings-radio-group">
                <label
                  className={`settings-radio${playlistDeleteBehavior === "find-playlist" ? " active" : ""}`}
                  onClick={() => onPlaylistDeleteBehaviorChange("find-playlist")}
                >
                  <span className="settings-radio-dot" />
                  <div className="settings-radio-text">
                    <span className="settings-radio-label">Find another playlist</span>
                    <span className="settings-radio-desc">Switch to another playlist that contains the track, or fall back to library</span>
                  </div>
                </label>
                <label
                  className={`settings-radio${playlistDeleteBehavior === "library" ? " active" : ""}`}
                  onClick={() => onPlaylistDeleteBehaviorChange("library")}
                >
                  <span className="settings-radio-dot" />
                  <div className="settings-radio-text">
                    <span className="settings-radio-label">Continue from library</span>
                    <span className="settings-radio-desc">Keep playing the track but switch context to the song library</span>
                  </div>
                </label>
                <label
                  className={`settings-radio${playlistDeleteBehavior === "stop" ? " active" : ""}`}
                  onClick={() => onPlaylistDeleteBehaviorChange("stop")}
                >
                  <span className="settings-radio-dot" />
                  <div className="settings-radio-text">
                    <span className="settings-radio-label">Stop playback</span>
                    <span className="settings-radio-desc">Immediately stop the current track</span>
                  </div>
                </label>
              </div>
            </div>
            )}

            {(!isSearching || matchesSearch("lyrics", "panel", "close", "click outside")) && (
            <div className="settings-group">
              <h3 className="settings-group-title">Lyrics Panel</h3>
              <label className="settings-toggle" onClick={() => onLyricsCloseOnClickOutsideChange(!lyricsCloseOnClickOutside)}>
                <div className={`settings-toggle-switch${lyricsCloseOnClickOutside ? " active" : ""}`}>
                  <span className="settings-toggle-knob" />
                </div>
                <div className="settings-radio-text">
                  <span className="settings-radio-label">Close on click outside</span>
                  <span className="settings-radio-desc">Close the lyrics panel when clicking anywhere outside of it</span>
                </div>
              </label>
            </div>
            )}

            {(!isSearching || matchesSearch("library", "navigation", "sidebar", "songs", "albums")) && (
            <div className="settings-group">
              <h3 className="settings-group-title">Library Navigation</h3>
              <p className="settings-description">
                What happens when you click "Library" in the sidebar?
              </p>
              <div className="settings-radio-group">
                <label
                  className={`settings-radio${libraryClickBehavior === "keep" ? " active" : ""}`}
                  onClick={() => onLibraryClickBehaviorChange("keep")}
                >
                  <span className="settings-radio-dot" />
                  <div className="settings-radio-text">
                    <span className="settings-radio-label">Stay on current tab</span>
                    <span className="settings-radio-desc">Keep the Songs/Albums tab, but exit album detail view</span>
                  </div>
                </label>
                <label
                  className={`settings-radio${libraryClickBehavior === "songs" ? " active" : ""}`}
                  onClick={() => onLibraryClickBehaviorChange("songs")}
                >
                  <span className="settings-radio-dot" />
                  <div className="settings-radio-text">
                    <span className="settings-radio-label">Always show Songs</span>
                    <span className="settings-radio-desc">Reset to the Songs tab every time</span>
                  </div>
                </label>
                <label
                  className={`settings-radio${libraryClickBehavior === "albums" ? " active" : ""}`}
                  onClick={() => onLibraryClickBehaviorChange("albums")}
                >
                  <span className="settings-radio-dot" />
                  <div className="settings-radio-text">
                    <span className="settings-radio-label">Always show Albums</span>
                    <span className="settings-radio-desc">Reset to the Albums tab every time</span>
                  </div>
                </label>
              </div>
            </div>
            )}

            {(!isSearching || matchesSearch("fullscreen", "player", "layout", "background", "controls", "karaoke", "cover")) && (
            <div className="settings-group">
              <h3 className="settings-group-title">Fullscreen Player</h3>
              <p className="settings-description">
                Customize the fullscreen player appearance. Click the cover art in the player to enter fullscreen.
              </p>

              <div className="settings-segment-group">
                <div className="settings-segment-row">
                  <span className="settings-segment-label">Layout</span>
                  <div className="settings-segment-buttons">
                    {([["side-by-side", "Side by Side"], ["cover", "Cover"], ["karaoke", "Karaoke"]] as const).map(([value, label]) => (
                      <button
                        key={value}
                        className={`settings-segment-btn${fullscreenLayout === value ? " active" : ""}`}
                        onClick={() => onFullscreenLayoutChange(value as FullscreenLayout)}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="settings-segment-row">
                  <span className="settings-segment-label">Background</span>
                  <div className="settings-segment-buttons">
                    {([["blurred-cover", "Blurred Cover"], ["color-gradient", "Color Gradient"], ["dark-accent", "Dark Glow"]] as const).map(([value, label]) => (
                      <button
                        key={value}
                        className={`settings-segment-btn${fullscreenBackground === value ? " active" : ""}`}
                        onClick={() => onFullscreenBackgroundChange(value as FullscreenBackground)}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="settings-segment-row">
                  <span className="settings-segment-label">Controls</span>
                  <div className="settings-segment-buttons">
                    {([["full", "Full"], ["minimal", "Minimal"], ["auto-hide", "Auto-hide"]] as const).map(([value, label]) => (
                      <button
                        key={value}
                        className={`settings-segment-btn${fullscreenControls === value ? " active" : ""}`}
                        onClick={() => onFullscreenControlsChange(value as FullscreenControls)}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
            )}
          </div>
        )}

        {(activeTab === "duplicates" || isSearching) && (!isSearching || matchesSearch("duplicate", "copies", "same track")) && (
          <div className="settings-section">
            <div className="settings-group">
              <h3 className="settings-group-title">Duplicate Tracks</h3>
              <p className="settings-description">
                Songs with the same title and artist found in 2 or more different directories.
              </p>
              {dupeGroups.length === 0 ? (
                <div className="settings-directory-empty">
                  No duplicates found.
                </div>
              ) : (
                <div className="settings-dupes">
                  {dupeGroups.map((group) => (
                    <div key={group.key} className="settings-dupe-group">
                      <div className="settings-dupe-header">
                        <span className="settings-dupe-title">{group.title}</span>
                        <span className="settings-dupe-artist">{group.artist}</span>
                        <span className="settings-dupe-count">{group.tracks.length} copies</span>
                      </div>
                      <div className="settings-dupe-paths">
                        {group.tracks.map((track) => (
                          <div key={track.path} className="settings-dupe-path">
                            <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor" className="settings-dupe-path-icon">
                              <path d="M14 2H6c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V8l-6-6zm-1 7V3.5L18.5 9H13z" />
                            </svg>
                            <span className="settings-dupe-path-text" title={track.path}>{track.path}</span>
                            <span className="settings-dupe-path-duration">{formatDuration(track.duration)}</span>
                            {confirmingDelete === track.path ? (
                              <div className="settings-dupe-confirm">
                                <span>Delete?</span>
                                <button
                                  className="settings-dupe-confirm-yes"
                                  onClick={() => { onDeleteTrack(track.path); setConfirmingDelete(null); }}
                                >
                                  Yes
                                </button>
                                <button
                                  className="settings-dupe-confirm-no"
                                  onClick={() => setConfirmingDelete(null)}
                                >
                                  No
                                </button>
                              </div>
                            ) : (
                              <button
                                className="settings-dupe-delete"
                                onClick={() => setConfirmingDelete(track.path)}
                                title="Delete this file"
                              >
                                <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor">
                                  <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z" />
                                </svg>
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="settings-group">
              <h3 className="settings-group-title">Probable Duplicates</h3>
              <p className="settings-description">
                Tracks with the same title found in different directories.
              </p>
              {probableDupes.length === 0 ? (
                <div className="settings-directory-empty">
                  No probable duplicates found.
                </div>
              ) : (
                <div className="settings-dupes">
                  {probableDupes.map((group) => (
                    <div key={group.title} className="settings-dupe-group probable">
                      <div className="settings-dupe-header">
                        <span className="settings-dupe-title">{group.title}</span>
                        <span className="settings-dupe-count">{group.tracks.length} copies</span>
                      </div>
                      <div className="settings-dupe-paths">
                        {group.tracks.map((track) => (
                          <div key={track.path} className="settings-dupe-path">
                            <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor" className="settings-dupe-path-icon">
                              <path d="M14 2H6c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V8l-6-6zm-1 7V3.5L18.5 9H13z" />
                            </svg>
                            <div className="settings-dupe-track-info">
                              <span className="settings-dupe-track-meta">
                                {track.title} — {track.artist} — {track.album}
                              </span>
                              <span className="settings-dupe-path-text" title={track.path}>{track.path}</span>
                            </div>
                            <span className="settings-dupe-path-duration">{formatDuration(track.duration)}</span>
                            {confirmingDelete === track.path ? (
                              <div className="settings-dupe-confirm">
                                <span>Delete?</span>
                                <button
                                  className="settings-dupe-confirm-yes"
                                  onClick={() => { onDeleteTrack(track.path); setConfirmingDelete(null); }}
                                >
                                  Yes
                                </button>
                                <button
                                  className="settings-dupe-confirm-no"
                                  onClick={() => setConfirmingDelete(null)}
                                >
                                  No
                                </button>
                              </div>
                            ) : (
                              <button
                                className="settings-dupe-delete"
                                onClick={() => setConfirmingDelete(track.path)}
                                title="Delete this file"
                              >
                                <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor">
                                  <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z" />
                                </svg>
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {(activeTab === "updates" || isSearching) && (!isSearching || matchesSearch("update", "version", "install", "download")) && (
          <div className="settings-section">
            <div className="settings-group">
              <h3 className="settings-group-title">App Updates</h3>
              <p className="settings-description">
                Check for new versions of LocalMP3 and install them directly.
              </p>
              <AppVersion />
              <UpdateChecker updateAvailable={updateAvailable} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
