import { useState, useMemo } from "react";
import { invoke } from "@tauri-apps/api/core";
import { save } from "@tauri-apps/plugin-dialog";
import { Track } from "../types";

interface LrcCreatorProps {
  tracks: Track[];
  onLrcLinked: (trackPath: string, lrcPath: string | null) => void;
}

type Tab = "finder" | "manual";

interface FinderTrack {
  track: Track;
  status: "idle" | "searching" | "found-synced" | "found-plain" | "not-found" | "saved" | "error";
  lyrics: string | null;
}

function formatDuration(secs: number): string {
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export default function LrcCreator({ tracks, onLrcLinked }: LrcCreatorProps) {
  const [activeTab, setActiveTab] = useState<Tab>("finder");
  const [lrcText, setLrcText] = useState("");
  const [lrcSaved, setLrcSaved] = useState(false);

  const [searchQuery, setSearchQuery] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [finderResults, setFinderResults] = useState<Map<string, FinderTrack>>(new Map());
  const [isSearching, setIsSearching] = useState(false);

  const availableTracks = useMemo(() => {
    const q = searchQuery.toLowerCase();
    return tracks.filter((t) => {
      if (t.lrc_path) return false;
      if (!q) return true;
      return (
        t.title.toLowerCase().includes(q) ||
        t.artist.toLowerCase().includes(q) ||
        t.album.toLowerCase().includes(q)
      );
    });
  }, [tracks, searchQuery]);

  function toggleSelect(path: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }

  function selectAll() {
    if (selected.size === availableTracks.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(availableTracks.map((t) => t.path)));
    }
  }

  async function handleSearch() {
    if (selected.size === 0) return;
    setIsSearching(true);

    const selectedTracks = tracks.filter((t) => selected.has(t.path));

    const initial = new Map<string, FinderTrack>();
    for (const t of selectedTracks) {
      initial.set(t.path, { track: t, status: "searching", lyrics: null });
    }
    setFinderResults(new Map(initial));

    for (const t of selectedTracks) {
      try {
        const result = await invoke<string | null>("search_lrc_online", {
          trackName: t.title,
          artistName: t.artist,
          duration: t.duration,
        });
        setFinderResults((prev) => {
          const next = new Map(prev);
          if (result) {
            const isSynced = result.includes("[");
            next.set(t.path, {
              track: t,
              status: isSynced ? "found-synced" : "found-plain",
              lyrics: result,
            });
          } else {
            next.set(t.path, { track: t, status: "not-found", lyrics: null });
          }
          return next;
        });
      } catch {
        setFinderResults((prev) => {
          const next = new Map(prev);
          next.set(t.path, { track: t, status: "error", lyrics: null });
          return next;
        });
      }
    }

    setIsSearching(false);
  }

  async function handleSaveResult(ft: FinderTrack) {
    if (!ft.lyrics) return;
    const audioPath = ft.track.path;
    const lrcPath = audioPath.replace(/\.[^.]+$/, ".lrc");
    try {
      await invoke("save_lrc_file", { path: lrcPath, content: ft.lyrics });
      await invoke("link_lrc", { trackPath: audioPath, lrcPath });
      onLrcLinked(audioPath, lrcPath);
      setFinderResults((prev) => {
        const next = new Map(prev);
        next.set(audioPath, { ...ft, status: "saved" });
        return next;
      });
    } catch (e) {
      console.error("Failed to save LRC:", e);
    }
  }

  async function handleSaveAllFound() {
    for (const [, ft] of finderResults) {
      if (ft.status === "found-synced" || ft.status === "found-plain") {
        await handleSaveResult(ft);
      }
    }
  }

  async function handleSaveLrc() {
    if (!lrcText.trim()) return;
    const path = await save({
      filters: [{ name: "LRC Files", extensions: ["lrc"] }],
      defaultPath: "lyrics.lrc",
    });
    if (path) {
      try {
        await invoke("save_lrc_file", { path, content: lrcText });
        setLrcSaved(true);
        setTimeout(() => setLrcSaved(false), 2000);
      } catch (e) {
        console.error("Failed to save LRC:", e);
      }
    }
  }

  const foundCount = [...finderResults.values()].filter(
    (r) => r.status === "found-synced" || r.status === "found-plain"
  ).length;

  return (
    <div className="lrc-creator">
      <div className="tracklist-header">
        <div className="tracklist-header-info">
          <span className="tracklist-label">TOOL</span>
          <h1 className="tracklist-title">LRC Manager</h1>
        </div>
        <a
          className="lrc-lib-link"
          href="https://lrclib.net"
          target="_blank"
          rel="noopener noreferrer"
        >
          <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor">
            <path d="M19 19H5V5h7V3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2v-7h-2v7zM14 3v2h3.59l-9.83 9.83 1.41 1.41L19 6.41V10h2V3h-7z" />
          </svg>
          lrclib.net
        </a>
      </div>

      <div className="tracklist-view-tabs">
        <button
          className={`tracklist-view-tab ${activeTab === "finder" ? "active" : ""}`}
          onClick={() => setActiveTab("finder")}
        >
          <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
            <path d="M15.5 14h-.79l-.28-.27C15.41 12.59 16 11.11 16 9.5 16 5.91 13.09 3 9.5 3S3 5.91 3 9.5 5.91 16 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z" />
          </svg>
          Finder
        </button>
        <button
          className={`tracklist-view-tab ${activeTab === "manual" ? "active" : ""}`}
          onClick={() => setActiveTab("manual")}
        >
          <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
            <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z" />
          </svg>
          Manual
        </button>
      </div>

      {activeTab === "finder" && (
        <div className="lrc-finder">
          <p className="settings-description">
            Select tracks to search for synced lyrics automatically on lrclib.net.
          </p>

          <div className="lrc-finder-controls">
            <input
              className="lrc-finder-search"
              type="text"
              placeholder="Filter tracks..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            <button
              className="lrc-clear-btn"
              onClick={selectAll}
            >
              {selected.size === availableTracks.length && availableTracks.length > 0
                ? "Deselect all"
                : "Select all"}
            </button>
            <button
              className="lrc-save-btn"
              onClick={handleSearch}
              disabled={selected.size === 0 || isSearching}
            >
              {isSearching ? (
                <>
                  <span className="lrc-spinner" />
                  Searching...
                </>
              ) : (
                <>
                  <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
                    <path d="M15.5 14h-.79l-.28-.27C15.41 12.59 16 11.11 16 9.5 16 5.91 13.09 3 9.5 3S3 5.91 3 9.5 5.91 16 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z" />
                  </svg>
                  Search ({selected.size})
                </>
              )}
            </button>
          </div>

          {availableTracks.length === 0 ? (
            <div className="tracklist-empty">
              {tracks.length === 0
                ? "No tracks in your library."
                : "All tracks already have lyrics linked."}
            </div>
          ) : (
            <div className="lrc-finder-list">
              {availableTracks.map((track) => {
                const result = finderResults.get(track.path);
                return (
                  <div
                    key={track.path}
                    className={`lrc-finder-item${selected.has(track.path) ? " selected" : ""}`}
                    onClick={() => toggleSelect(track.path)}
                  >
                    <div className="lrc-finder-check">
                      {selected.has(track.path) ? (
                        <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
                          <path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-9 14l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z" />
                        </svg>
                      ) : (
                        <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
                          <path d="M19 5v14H5V5h14m0-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2z" />
                        </svg>
                      )}
                    </div>
                    <div className="lrc-finder-info">
                      <span className="lrc-finder-title">{track.title}</span>
                      <span className="lrc-finder-meta">
                        {track.artist} &middot; {formatDuration(track.duration)}
                      </span>
                    </div>
                    {result && (
                      <div className="lrc-finder-status">
                        {result.status === "searching" && (
                          <span className="lrc-status searching">
                            <span className="lrc-spinner" />
                          </span>
                        )}
                        {result.status === "found-synced" && (
                          <span className="lrc-status found">Synced</span>
                        )}
                        {result.status === "found-plain" && (
                          <span className="lrc-status found-plain">Unsynced</span>
                        )}
                        {result.status === "not-found" && (
                          <span className="lrc-status not-found">Not found</span>
                        )}
                        {result.status === "saved" && (
                          <span className="lrc-status saved">
                            <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor">
                              <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" />
                            </svg>
                            Saved
                          </span>
                        )}
                        {result.status === "error" && (
                          <span className="lrc-status not-found">Error</span>
                        )}
                        {(result.status === "found-synced" || result.status === "found-plain") && (
                          <button
                            className="lrc-finder-save-btn"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleSaveResult(result);
                            }}
                          >
                            Save
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {foundCount > 0 && (
            <div className="lrc-actions" style={{ marginTop: 16 }}>
              <button className="lrc-save-btn" onClick={handleSaveAllFound}>
                <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
                  <path d="M17 3H5c-1.11 0-2 .9-2 2v14c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V7l-4-4zm-5 16c-1.66 0-3-1.34-3-3s1.34-3 3-3 3 1.34 3 3-1.34 3-3 3zm3-10H5V5h10v4z" />
                </svg>
                Save all found ({foundCount})
              </button>
            </div>
          )}
        </div>
      )}

      {activeTab === "manual" && (
        <div className="lrc-manual">
          <p className="settings-description" style={{ marginBottom: 16 }}>
            Paste lyrics with timestamps below. Save the .lrc file next to your audio file with the same name for auto-linking (e.g. song.mp3 → song.lrc).
          </p>
          <textarea
            className="lrc-textarea"
            value={lrcText}
            onChange={(e) => setLrcText(e.target.value)}
            placeholder={"[00:13.41] First line of lyrics\n[00:17.93] Second line\n[00:24.13] Third line..."}
            spellCheck={false}
          />
          <div className="lrc-actions">
            <button
              className="lrc-save-btn"
              onClick={handleSaveLrc}
              disabled={!lrcText.trim()}
            >
              {lrcSaved ? (
                <>
                  <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
                    <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" />
                  </svg>
                  Saved
                </>
              ) : (
                <>
                  <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
                    <path d="M17 3H5c-1.11 0-2 .9-2 2v14c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V7l-4-4zm-5 16c-1.66 0-3-1.34-3-3s1.34-3 3-3 3 1.34 3 3-1.34 3-3 3zm3-10H5V5h10v4z" />
                  </svg>
                  Save as .lrc
                </>
              )}
            </button>
            {lrcText.trim() && (
              <button className="lrc-clear-btn" onClick={() => setLrcText("")}>
                Clear
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
