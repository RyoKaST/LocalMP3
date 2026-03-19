import { useState, useMemo } from "react";
import { Track } from "../types";

interface SettingsProps {
  accentColor: string;
  theme: "dark" | "light";
  libraryPaths: string[];
  tracks: Track[];
  onAccentChange: (color: string) => void;
  onThemeChange: (theme: "dark" | "light") => void;
  onAddFolder: () => void;
  onRemoveFolder: (path: string) => void;
  onDeleteTrack: (trackPath: string) => void;
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

type Tab = "appearances" | "directories" | "duplicates";

function getParentDir(filePath: string, libraryPaths: string[]): string {
  for (const lp of libraryPaths) {
    if (filePath.startsWith(lp)) return lp;
  }
  // Fallback: return the immediate parent directory
  const sep = filePath.includes("/") ? "/" : "\\";
  return filePath.substring(0, filePath.lastIndexOf(sep));
}

function formatDuration(secs: number): string {
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
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

export default function Settings({
  accentColor,
  theme,
  libraryPaths,
  tracks,
  onAccentChange,
  onThemeChange,
  onAddFolder,
  onRemoveFolder,
  onDeleteTrack,
}: SettingsProps) {
  const [activeTab, setActiveTab] = useState<Tab>("appearances");
  const [confirmingDelete, setConfirmingDelete] = useState<string | null>(null);

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

    // Group tracks by title across different directories
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

      // Exclude groups where all entries are the same title+artist (already in exact dupes)
      const byArtist = new Map<string, typeof entries>();
      for (const e of entries) {
        const key = `${title}::${e.artist.toLowerCase()}`;
        const arr = byArtist.get(key) || [];
        arr.push(e);
        byArtist.set(key, arr);
      }
      // If every entry maps to a single exact-dupe key, skip
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

      <div className="settings-tabs">
        <button
          className={`settings-tab ${activeTab === "appearances" ? "active" : ""}`}
          onClick={() => setActiveTab("appearances")}
        >
          Appearances
        </button>
        <button
          className={`settings-tab ${activeTab === "directories" ? "active" : ""}`}
          onClick={() => setActiveTab("directories")}
        >
          Directories
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
      </div>

      <div className="settings-content">
        {activeTab === "appearances" && (
          <div className="settings-section">
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
              <div className="settings-custom-color">
                <label>
                  Custom
                  <input
                    type="color"
                    value={accentColor}
                    onChange={(e) => onAccentChange(e.target.value)}
                  />
                </label>
              </div>
            </div>
          </div>
        )}

        {activeTab === "directories" && (
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
              <button className="settings-add-dir-btn" onClick={onAddFolder}>
                <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
                  <path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z" />
                </svg>
                Add Directory
              </button>
            </div>
          </div>
        )}

        {activeTab === "duplicates" && (
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
      </div>
    </div>
  );
}
