import { useState, useRef, useEffect, useMemo, useCallback } from "react";
import { convertFileSrc } from "@tauri-apps/api/core";
import { Track, Playlist, VideoFile } from "../types";
import ContextMenu from "./ContextMenu";

type LibraryClickBehavior = "songs" | "albums" | "keep";

interface TrackListProps {
  tracks: Track[];
  playlist: Playlist | null;
  currentTrack: Track | null;
  isPlaying: boolean;
  playlists: Playlist[];
  libraryClickBehavior: LibraryClickBehavior;
  libraryResetKey: number;
  onPlay: (track: Track, queue: Track[], source: string) => void;
  onAddToPlaylist: (playlistId: string, track: Track) => void;
  onRemoveFromPlaylist: (playlistId: string, trackPath: string) => void;
  onUpdatePlaylist: (id: string, name?: string, cover?: string) => void;
  onPickCover: (playlistId: string) => void;
  onEditTrack: (track: Track) => void;
  onLinkLrc: (track: Track) => void;
  onLinkVideo: (track: Track) => void;
  videos: VideoFile[];
  onPlayVideo: (videoPath: string) => void;
  onLinkVideoToTrack: (trackPath: string, videoPath: string) => void;
  onUnlinkVideo: (trackPath: string) => void;
  onReorderTrack: (playlistId: string, fromIndex: number, toIndex: number) => void;
}

function formatDuration(secs: number): string {
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

type SortKey = "title" | "artist" | "album" | "duration";
type SortDir = "asc" | "desc";

function sortTracks(tracks: Track[], key: SortKey, dir: SortDir): Track[] {
  return [...tracks].sort((a, b) => {
    let cmp: number;
    if (key === "duration") {
      cmp = a.duration - b.duration;
    } else {
      cmp = a[key].toLowerCase().localeCompare(b[key].toLowerCase());
    }
    return dir === "desc" ? -cmp : cmp;
  });
}

interface Album {
  name: string;
  artist: string;
  cover: string | null;
  tracks: Track[];
  totalDuration: number;
}

type ViewMode = "songs" | "albums" | "videos";

function DropIndicator({ tbodyRef, dragState }: {
  tbodyRef: React.RefObject<HTMLTableSectionElement | null>;
  dragState: { fromIndex: number; overIndex: number };
}) {
  const tbody = tbodyRef.current;
  if (!tbody) return null;
  const rows = tbody.children;
  const targetRow = rows[dragState.overIndex] as HTMLElement | undefined;
  if (!targetRow) return null;
  const draggingDown = dragState.fromIndex < dragState.overIndex;
  const rect = targetRow.getBoundingClientRect();
  const y = draggingDown ? rect.bottom : rect.top;
  return (
    <div
      className="drop-indicator"
      style={{ position: "fixed", top: y - 1, left: rect.left, width: rect.width }}
    />
  );
}

export default function TrackList({
  tracks,
  playlist,
  currentTrack,
  isPlaying,
  playlists,
  onPlay,
  onAddToPlaylist,
  onRemoveFromPlaylist,
  onUpdatePlaylist,
  onPickCover,
  onEditTrack,
  onLinkLrc,
  onLinkVideo,
  libraryClickBehavior,
  libraryResetKey,
  videos,
  onPlayVideo,
  onLinkVideoToTrack,
  onUnlinkVideo,
  onReorderTrack,
}: TrackListProps) {
  const [sortKey, setSortKey] = useState<SortKey | null>(playlist ? null : "title");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [searchQuery, setSearchQuery] = useState("");
  const [reorderMode, setReorderMode] = useState(false);
  const tbodyRef = useRef<HTMLTableSectionElement>(null);
  const [dragState, setDragState] = useState<{
    fromIndex: number;
    overIndex: number;
  } | null>(null);
  const dragRef = useRef<{ fromIndex: number; overIndex: number } | null>(null);
  const ghostRef = useRef<HTMLDivElement | null>(null);
  const rawTracks = playlist ? playlist.tracks : tracks;

  const filteredTracks = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return rawTracks;
    return rawTracks.filter(
      (t) =>
        t.title.toLowerCase().includes(q) ||
        t.artist.toLowerCase().includes(q) ||
        t.album.toLowerCase().includes(q),
    );
  }, [rawTracks, searchQuery]);

  const displayTracks = playlist
    ? (reorderMode ? rawTracks : filteredTracks)
    : sortTracks(filteredTracks, sortKey || "title", sortDir);

  const getOverIndex = useCallback((clientY: number): number => {
    const tbody = tbodyRef.current;
    if (!tbody) return 0;
    const rows = Array.from(tbody.children) as HTMLElement[];
    for (let i = 0; i < rows.length; i++) {
      const rect = rows[i].getBoundingClientRect();
      if (clientY < rect.top + rect.height / 2) return i;
    }
    return rows.length - 1;
  }, []);

  const createGhost = useCallback((sourceRow: HTMLElement, clientY: number) => {
    const rect = sourceRow.getBoundingClientRect();
    const ghost = document.createElement("div");
    ghost.className = "drag-ghost";
    ghost.style.width = rect.width + "px";
    ghost.style.top = clientY - rect.height / 2 + "px";
    ghost.style.left = rect.left + "px";

    const cells = sourceRow.querySelectorAll("td");
    cells.forEach((cell) => {
      if (cell.classList.contains("col-drag-handle")) return;
      const clone = document.createElement("span");
      clone.className = "drag-ghost-cell";
      clone.textContent = cell.textContent || "";
      ghost.appendChild(clone);
    });

    document.body.appendChild(ghost);
    ghostRef.current = ghost;
  }, []);

  const handleDragPointerDown = useCallback((e: React.PointerEvent, index: number) => {
    if (!playlist) return;
    e.preventDefault();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);

    const row = (e.target as HTMLElement).closest("tr");
    if (row) createGhost(row, e.clientY);

    const state = { fromIndex: index, overIndex: index };
    dragRef.current = state;
    setDragState(state);
  }, [playlist, createGhost]);

  const handleDragPointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragRef.current) return;
    if (ghostRef.current) {
      const ghost = ghostRef.current;
      const h = ghost.offsetHeight;
      ghostRef.current.style.top = e.clientY - h / 2 + "px";
    }
    const over = getOverIndex(e.clientY);
    if (over !== dragRef.current.overIndex) {
      dragRef.current = { ...dragRef.current, overIndex: over };
      setDragState({ ...dragRef.current });
    }
  }, [getOverIndex]);

  const handleDragPointerUp = useCallback((e: React.PointerEvent) => {
    if (ghostRef.current) {
      ghostRef.current.remove();
      ghostRef.current = null;
    }
    const state = dragRef.current;
    if (!state || !playlist) {
      dragRef.current = null;
      setDragState(null);
      return;
    }
    (e.target as HTMLElement).releasePointerCapture(e.pointerId);
    if (state.fromIndex !== state.overIndex) {
      onReorderTrack(playlist.id, state.fromIndex, state.overIndex);
    }
    dragRef.current = null;
    setDragState(null);
  }, [playlist, onReorderTrack]);

  const [contextMenu, setContextMenu] = useState<{
    track: Track;
    x: number;
    y: number;
  } | null>(null);
  const [videoContextMenu, setVideoContextMenu] = useState<{
    video: VideoFile;
    x: number;
    y: number;
  } | null>(null);
  const [showTrackPicker, setShowTrackPicker] = useState<VideoFile | null>(null);
  const [trackPickerSearch, setTrackPickerSearch] = useState("");
  const [editingName, setEditingName] = useState<string | null>(null);
  const [nameError, setNameError] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>("songs");
  const [selectedAlbum, setSelectedAlbum] = useState<string | null>(null);
  const lastResetKey = useRef(libraryResetKey);

  useEffect(() => {
    setReorderMode(false);
    setSortKey(playlist ? null : "title");
    setSortDir("asc");
  }, [playlist?.id]);

  useEffect(() => {
    if (!videoContextMenu) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (target.closest(".context-menu")) return;
      setVideoContextMenu(null);
    };
    const raf = requestAnimationFrame(() => {
      document.addEventListener("mousedown", handler);
    });
    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener("mousedown", handler);
    };
  }, [videoContextMenu]);

  useEffect(() => {
    if (libraryResetKey === lastResetKey.current) return;
    lastResetKey.current = libraryResetKey;
    if (!playlist) {
      if (libraryClickBehavior === "songs") {
        setViewMode("songs");
        setSelectedAlbum(null);
      } else if (libraryClickBehavior === "albums") {
        setViewMode("albums");
        setSelectedAlbum(null);
      } else {
        setSelectedAlbum(null);
      }
    }
  }, [libraryResetKey, libraryClickBehavior, playlist]);

  const albums = useMemo<Album[]>(() => {
    const map = new Map<string, Album>();
    for (const track of filteredTracks) {
      const primaryArtist = track.artist.split(";")[0].trim();
      const key = `${track.album.toLowerCase()}::${primaryArtist.toLowerCase()}`;
      if (!map.has(key)) {
        map.set(key, {
          name: track.album,
          artist: primaryArtist,
          cover: track.cover,
          tracks: [],
          totalDuration: 0,
        });
      }
      const album = map.get(key)!;
      album.tracks.push(track);
      album.totalDuration += track.duration;
      if (!album.cover && track.cover) album.cover = track.cover;
    }
    const result = [...map.values()];
    result.sort((a, b) =>
      a.name.toLowerCase().localeCompare(b.name.toLowerCase()),
    );
    return result;
  }, [filteredTracks]);

  const activeAlbum = useMemo(() => {
    if (!selectedAlbum) return null;
    const album = albums.find(
      (a) =>
        `${a.name.toLowerCase()}::${a.artist.toLowerCase()}` === selectedAlbum,
    );
    if (!album) return null;
    const sortedTracks = [...album.tracks].sort((a, b) => {
      if (a.track_number == null && b.track_number == null) return 0;
      if (a.track_number == null) return 1;
      if (b.track_number == null) return -1;
      return a.track_number - b.track_number;
    });
    return { ...album, tracks: sortedTracks };
  }, [selectedAlbum, albums]);

  function handleSort(key: SortKey) {
    if (sortKey === key) {
      if (sortDir === "asc") {
        setSortDir("desc");
      } else if (playlist) {
        setSortKey(null);
        setSortDir("asc");
      } else {
        setSortDir("asc");
      }
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  }

  function handleContextMenu(track: Track, e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({ track, x: e.clientX, y: e.clientY });
  }

  function handleDotsClick(track: Track, e: React.MouseEvent) {
    e.stopPropagation();
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setContextMenu({ track, x: rect.left, y: rect.bottom + 4 });
  }

  return (
    <div className="tracklist">
      {playlist ? (
        <div className="tracklist-header">
          <div
            className="tracklist-cover"
            onClick={() => onPickCover(playlist.id)}
          >
            {playlist.cover ? (
              <img src={playlist.cover} alt="" />
            ) : (
              <div className="tracklist-cover-placeholder">
                <svg
                  viewBox="0 0 24 24"
                  width="48"
                  height="48"
                  fill="currentColor"
                >
                  <path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55C7.79 13 6 14.79 6 17s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z" />
                </svg>
              </div>
            )}
          </div>
          <div className="tracklist-header-info">
            <span className="tracklist-label">PLAYLIST</span>
            <div className="tracklist-title-input-wrapper">
              <input
                className={`tracklist-title-input${nameError ? " tracklist-title-input-error" : ""}`}
                value={editingName !== null ? editingName : playlist.name}
                onChange={(e) => {
                  setEditingName(e.target.value);
                  if (e.target.value.trim()) setNameError(false);
                }}
                onFocus={() => setEditingName(playlist.name)}
                onBlur={() => {
                  if (editingName !== null && editingName.trim()) {
                    onUpdatePlaylist(playlist.id, editingName.trim());
                    setEditingName(null);
                    setNameError(false);
                  } else if (editingName !== null && !editingName.trim()) {
                    setNameError(true);
                    setTimeout(() => {
                      setNameError(false);
                      setEditingName(playlist.name);
                    }, 1500);
                  }
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    if (editingName && editingName.trim()) {
                      onUpdatePlaylist(playlist.id, editingName.trim());
                      setEditingName(null);
                      setNameError(false);
                      (e.target as HTMLInputElement).blur();
                    } else {
                      setNameError(true);
                      setTimeout(() => setNameError(false), 1500);
                    }
                  } else if (e.key === "Escape") {
                    setEditingName(null);
                    setNameError(false);
                    (e.target as HTMLInputElement).blur();
                  }
                }}
              />
              {nameError && (
                <span className="tracklist-title-error">
                  Name cannot be empty
                </span>
              )}
            </div>
            <span className="tracklist-meta">
              {playlist.tracks.length} track
              {playlist.tracks.length !== 1 ? "s" : ""}
            </span>
            <button
              className={`tracklist-reorder-btn${reorderMode ? " active" : ""}`}
              onClick={() => setReorderMode((r) => !r)}
              title={reorderMode ? "Done reordering" : "Edit order"}
            >
              <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
                <path d="M3 15h18v-2H3v2zm0 4h18v-2H3v2zm0-8h18V9H3v2zm0-6v2h18V5H3z" />
              </svg>
              {reorderMode ? "Done" : "Edit order"}
            </button>
          </div>
          <div className="tracklist-search-wrapper">
            <div className="tracklist-search">
              <svg
                viewBox="0 0 24 24"
                width="16"
                height="16"
                fill="currentColor"
              >
                <path d="M15.5 14h-.79l-.28-.27C15.41 12.59 16 11.11 16 9.5 16 5.91 13.09 3 9.5 3S3 5.91 3 9.5 5.91 16 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z" />
              </svg>
              <input
                type="text"
                placeholder="Search..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
              {searchQuery && (
                <button
                  className="tracklist-search-clear"
                  onClick={() => setSearchQuery("")}
                >
                  <svg
                    viewBox="0 0 24 24"
                    width="14"
                    height="14"
                    fill="currentColor"
                  >
                    <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
                  </svg>
                </button>
              )}
            </div>
          </div>
        </div>
      ) : (
        <div className="tracklist-header">
          <div className="tracklist-header-info">
            <span className="tracklist-label">YOUR LIBRARY</span>
            <h1 className="tracklist-title">All Tracks</h1>
            <span className="tracklist-meta">{tracks.length} tracks</span>
          </div>
          <div className="tracklist-search-wrapper">
            <div className="tracklist-search">
              <svg
                viewBox="0 0 24 24"
                width="16"
                height="16"
                fill="currentColor"
              >
                <path d="M15.5 14h-.79l-.28-.27C15.41 12.59 16 11.11 16 9.5 16 5.91 13.09 3 9.5 3S3 5.91 3 9.5 5.91 16 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z" />
              </svg>
              <input
                type="text"
                placeholder="Search..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
              {searchQuery && (
                <button
                  className="tracklist-search-clear"
                  onClick={() => setSearchQuery("")}
                >
                  <svg
                    viewBox="0 0 24 24"
                    width="14"
                    height="14"
                    fill="currentColor"
                  >
                    <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
                  </svg>
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      <div className="tracklist-view-tabs">
        <button
          className={`tracklist-view-tab ${viewMode === "songs" ? "active" : ""}`}
          onClick={() => {
            setViewMode("songs");
            setSelectedAlbum(null);
          }}
        >
          <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
            <path d="M4 6h16v2H4zm0 5h16v2H4zm0 5h16v2H4z" />
          </svg>
          Songs
        </button>
        <button
          className={`tracklist-view-tab ${viewMode === "albums" ? "active" : ""}`}
          onClick={() => setViewMode("albums")}
        >
          <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 14.5c-2.49 0-4.5-2.01-4.5-4.5S9.51 7.5 12 7.5s4.5 2.01 4.5 4.5-2.01 4.5-4.5 4.5zm0-5.5c-.55 0-1 .45-1 1s.45 1 1 1 1-.45 1-1-.45-1-1-1z" />
          </svg>
          Albums
        </button>
        <button
          className={`tracklist-view-tab ${viewMode === "videos" ? "active" : ""}`}
          onClick={() => setViewMode("videos")}
        >
          <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
            <path d="M18 4l2 4h-3l-2-4h-2l2 4h-3l-2-4H8l2 4H7L5 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V4h-4z" />
          </svg>
          Videos
        </button>
      </div>

      {viewMode === "songs" &&
        (displayTracks.length === 0 ? (
          <div className="tracklist-empty">
            {playlist
              ? "This playlist is empty. Add tracks from your library."
              : "No tracks found. Select a folder containing audio files."}
          </div>
        ) : (
          <table className="tracklist-table">
            <thead>
              <tr>
                {reorderMode && <th className="col-drag-handle"></th>}
                <th
                  className={`col-title${!playlist ? ` sortable ${sortKey === "title" ? "sorted" : ""}` : ""}`}
                  onClick={!playlist ? () => handleSort("title") : undefined}
                >
                  Title{" "}
                  {sortKey === "title" && (
                    <span className="sort-arrow">
                      {sortDir === "asc" ? "\u25B2" : "\u25BC"}
                    </span>
                  )}
                </th>
                <th
                  className={`col-artist${!playlist ? ` sortable ${sortKey === "artist" ? "sorted" : ""}` : ""}`}
                  onClick={!playlist ? () => handleSort("artist") : undefined}
                >
                  Artist{" "}
                  {sortKey === "artist" && (
                    <span className="sort-arrow">
                      {sortDir === "asc" ? "\u25B2" : "\u25BC"}
                    </span>
                  )}
                </th>
                <th
                  className={`col-album${!playlist ? ` sortable ${sortKey === "album" ? "sorted" : ""}` : ""}`}
                  onClick={!playlist ? () => handleSort("album") : undefined}
                >
                  Album{" "}
                  {sortKey === "album" && (
                    <span className="sort-arrow">
                      {sortDir === "asc" ? "\u25B2" : "\u25BC"}
                    </span>
                  )}
                </th>
                <th
                  className={`col-duration${!playlist ? ` sortable ${sortKey === "duration" ? "sorted" : ""}` : ""}`}
                  onClick={!playlist ? () => handleSort("duration") : undefined}
                >
                  Duration{" "}
                  {sortKey === "duration" && (
                    <span className="sort-arrow">
                      {sortDir === "asc" ? "\u25B2" : "\u25BC"}
                    </span>
                  )}
                </th>
                <th className="col-actions"></th>
              </tr>
            </thead>
            <tbody ref={tbodyRef}>
              {displayTracks.map((track, index) => {
                const isDragSource = dragState?.fromIndex === index;

                return (
                <tr
                  key={track.path + index}
                  className={[
                    "tracklist-row",
                    currentTrack?.path === track.path ? "playing" : "",
                    isDragSource ? "drag-source" : "",
                  ].filter(Boolean).join(" ")}
                  onDoubleClick={() =>
                    onPlay(
                      track,
                      displayTracks,
                      playlist ? playlist.name : "Library",
                    )
                  }
                  onContextMenu={(e) => handleContextMenu(track, e)}
                >
                  {reorderMode && playlist && (
                    <td
                      className="col-drag-handle"
                      onPointerDown={(e) => handleDragPointerDown(e, index)}
                      onPointerMove={handleDragPointerMove}
                      onPointerUp={handleDragPointerUp}
                    >
                      <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
                        <path d="M11 18c0 1.1-.9 2-2 2s-2-.9-2-2 .9-2 2-2 2 .9 2 2zm-2-8c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm0-6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm6 4c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm0 2c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm0 6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z" />
                      </svg>
                    </td>
                  )}
                  <td className="col-title">
                    <div className="track-title-cell">
                      <div className="track-cover-small">
                        {track.cover ? (
                          <img
                            src={convertFileSrc(track.cover)}
                            alt=""
                            className={
                              currentTrack?.path === track.path
                                ? "cover-greyed"
                                : ""
                            }
                          />
                        ) : (
                          <svg
                            viewBox="0 0 24 24"
                            width="16"
                            height="16"
                            fill="currentColor"
                          >
                            <path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55C7.79 13 6 14.79 6 17s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z" />
                          </svg>
                        )}
                        {currentTrack?.path === track.path &&
                          (isPlaying ? (
                            <span className="playing-icon playing-icon-overlay">
                              <span></span>
                              <span></span>
                              <span></span>
                            </span>
                          ) : (
                            <svg
                              className="playing-icon-overlay"
                              viewBox="0 0 24 24"
                              width="20"
                              height="20"
                              fill="var(--accent)"
                            >
                              <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
                            </svg>
                          ))}
                      </div>
                      <span>{track.title}</span>
                    </div>
                  </td>
                  <td className="col-artist">{track.artist}</td>
                  <td className="col-album">{track.album}</td>
                  <td className="col-duration">
                    {formatDuration(track.duration)}
                  </td>
                  <td className="col-actions">
                    <button
                      className="dots-btn"
                      onClick={(e) => handleDotsClick(track, e)}
                    >
                      <svg
                        viewBox="0 0 24 24"
                        width="18"
                        height="18"
                        fill="currentColor"
                      >
                        <circle cx="12" cy="5" r="2" />
                        <circle cx="12" cy="12" r="2" />
                        <circle cx="12" cy="19" r="2" />
                      </svg>
                    </button>
                  </td>
                </tr>
                );
              })}
            </tbody>
          </table>
        ))}
      {dragState && dragState.fromIndex !== dragState.overIndex && <DropIndicator tbodyRef={tbodyRef} dragState={dragState} />}

      {viewMode === "albums" &&
        !activeAlbum &&
        (albums.length === 0 ? (
          <div className="tracklist-empty">
            {playlist
              ? "This playlist is empty. Add tracks from your library."
              : "No tracks found. Select a folder containing audio files."}
          </div>
        ) : (
          <div className="album-grid">
            {albums.map((album) => {
              const key = `${album.name.toLowerCase()}::${album.artist.toLowerCase()}`;
              const isPlayingAlbum =
                currentTrack &&
                album.tracks.some((t) => t.path === currentTrack.path);
              return (
                <div
                  key={key}
                  className={`album-card ${isPlayingAlbum ? "playing" : ""}`}
                  onClick={() => setSelectedAlbum(key)}
                >
                  <div className="album-card-cover">
                    {album.cover ? (
                      <img src={convertFileSrc(album.cover)} alt="" />
                    ) : (
                      <div className="album-card-cover-placeholder">
                        <svg
                          viewBox="0 0 24 24"
                          width="32"
                          height="32"
                          fill="currentColor"
                        >
                          <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 14.5c-2.49 0-4.5-2.01-4.5-4.5S9.51 7.5 12 7.5s4.5 2.01 4.5 4.5-2.01 4.5-4.5 4.5zm0-5.5c-.55 0-1 .45-1 1s.45 1 1 1 1-.45 1-1-.45-1-1-1z" />
                        </svg>
                      </div>
                    )}
                    <button
                      className="album-card-play"
                      onClick={(e) => {
                        e.stopPropagation();
                        if (album.tracks.length > 0)
                          onPlay(album.tracks[0], album.tracks, album.name);
                      }}
                    >
                      <svg
                        viewBox="0 0 24 24"
                        width="24"
                        height="24"
                        fill="currentColor"
                      >
                        <path d="M8 5v14l11-7z" />
                      </svg>
                    </button>
                  </div>
                  <div className="album-card-info">
                    <span className="album-card-name">{album.name}</span>
                    <span className="album-card-artist">{album.artist}</span>
                  </div>
                </div>
              );
            })}
          </div>
        ))}

      {viewMode === "albums" && activeAlbum && (
        <div className="album-detail">
          <button
            className="album-detail-back"
            onClick={() => setSelectedAlbum(null)}
          >
            <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
              <path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z" />
            </svg>
            <span>All Albums</span>
          </button>
          <div className="album-detail-header">
            <div className="album-detail-cover">
              {activeAlbum.cover ? (
                <img src={convertFileSrc(activeAlbum.cover)} alt="" />
              ) : (
                <div className="album-card-cover-placeholder">
                  <svg
                    viewBox="0 0 24 24"
                    width="40"
                    height="40"
                    fill="currentColor"
                  >
                    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 14.5c-2.49 0-4.5-2.01-4.5-4.5S9.51 7.5 12 7.5s4.5 2.01 4.5 4.5-2.01 4.5-4.5 4.5zm0-5.5c-.55 0-1 .45-1 1s.45 1 1 1 1-.45 1-1-.45-1-1-1z" />
                  </svg>
                </div>
              )}
            </div>
            <div className="album-detail-info">
              <span className="tracklist-label">ALBUM</span>
              <h2 className="album-detail-name">{activeAlbum.name}</h2>
              <span className="album-detail-meta">
                {activeAlbum.artist} &middot; {activeAlbum.tracks.length} track
                {activeAlbum.tracks.length !== 1 ? "s" : ""} &middot;{" "}
                {formatDuration(activeAlbum.totalDuration)}
              </span>
            </div>
          </div>
          <table className="tracklist-table">
            <thead>
              <tr>
                <th className="col-num">#</th>
                <th className="col-title">Title</th>
                <th className="col-duration">Duration</th>
                <th className="col-actions"></th>
              </tr>
            </thead>
            <tbody>
              {activeAlbum.tracks.map((track, index) => (
                <tr
                  key={track.path}
                  className={`tracklist-row ${currentTrack?.path === track.path ? "playing" : ""}`}
                  onDoubleClick={() =>
                    onPlay(track, activeAlbum.tracks, activeAlbum.name)
                  }
                  onContextMenu={(e) => handleContextMenu(track, e)}
                >
                  <td className="col-num">
                    {currentTrack?.path === track.path && isPlaying ? (
                      <span className="playing-icon">
                        <span></span>
                        <span></span>
                        <span></span>
                      </span>
                    ) : (
                      index + 1
                    )}
                  </td>
                  <td className="col-title">{track.title}</td>
                  <td className="col-duration">
                    {formatDuration(track.duration)}
                  </td>
                  <td className="col-actions">
                    <button
                      className="dots-btn"
                      onClick={(e) => handleDotsClick(track, e)}
                    >
                      <svg
                        viewBox="0 0 24 24"
                        width="18"
                        height="18"
                        fill="currentColor"
                      >
                        <circle cx="12" cy="5" r="2" />
                        <circle cx="12" cy="12" r="2" />
                        <circle cx="12" cy="19" r="2" />
                      </svg>
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {viewMode === "videos" &&
        (videos.length === 0 ? (
          <div className="tracklist-empty">
            No video files found in your library folders.
          </div>
        ) : (
          <div className="album-grid">
            {videos.map((video) => (
              <div
                key={video.path}
                className="album-card"
                onDoubleClick={() => onPlayVideo(video.path)}
                onContextMenu={(e) => {
                  e.preventDefault();
                  setVideoContextMenu({ video, x: e.clientX, y: e.clientY });
                }}
              >
                <div className="album-card-cover">
                  {(() => {
                    const linkedTrack = video.linked_track_path
                      ? tracks.find((t) => t.path === video.linked_track_path)
                      : null;
                    return linkedTrack?.cover ? (
                      <img src={convertFileSrc(linkedTrack.cover)} alt="" />
                    ) : (
                      <div className="album-card-cover-placeholder video-placeholder">
                        <svg viewBox="0 0 24 24" width="32" height="32" fill="currentColor">
                          <path d="M18 4l2 4h-3l-2-4h-2l2 4h-3l-2-4H8l2 4H7L5 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V4h-4z" />
                        </svg>
                      </div>
                    );
                  })()}
                  <button
                    className="album-card-play"
                    onClick={(e) => {
                      e.stopPropagation();
                      onPlayVideo(video.path);
                    }}
                  >
                    <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor">
                      <path d="M8 5v14l11-7z" />
                    </svg>
                  </button>
                </div>
                <div className="album-card-info">
                  <span className="album-card-name">{video.title}</span>
                  <span className="album-card-artist">
                    {video.path.split(".").pop()?.toUpperCase()}
                    {video.linked_track_path && <span className="video-linked-badge"> — Linked</span>}
                  </span>
                </div>
              </div>
            ))}
          </div>
        ))}

      {videoContextMenu && (
        <>
          <div
            className="context-menu"
            style={{
              position: "fixed",
              top: videoContextMenu.y,
              left: videoContextMenu.x,
              zIndex: 1000,
            }}
          >
            <div className="context-menu-video-details">
              <span className="context-menu-video-filename">
                {videoContextMenu.video.path.split(/[/\\]/).pop()}
              </span>
              <span className="context-menu-video-path">
                {videoContextMenu.video.path.split(/[/\\]/).slice(0, -1).join("/")}
              </span>
            </div>
            <button
              className="context-menu-item"
              onClick={() => {
                setShowTrackPicker(videoContextMenu.video);
                setVideoContextMenu(null);
              }}
            >
              <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
                <path d="M3.9 12c0-1.71 1.39-3.1 3.1-3.1h4V7H7c-2.76 0-5 2.24-5 5s2.24 5 5 5h4v-1.9H7c-1.71 0-3.1-1.39-3.1-3.1zM8 13h8v-2H8v2zm9-6h-4v1.9h4c1.71 0 3.1 1.39 3.1 3.1s-1.39 3.1-3.1 3.1h-4V17h4c2.76 0 5-2.24 5-5s-2.24-5-5-5z" />
              </svg>
              Link to track
            </button>
            {videoContextMenu.video.linked_track_path && (
              <button
                className="context-menu-item context-menu-danger"
                onClick={() => {
                  onUnlinkVideo(videoContextMenu.video.linked_track_path!);
                  setVideoContextMenu(null);
                }}
              >
                <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
                  <path d="M19 13H5v-2h14v2z" />
                </svg>
                Unlink from track
              </button>
            )}
          </div>
        </>
      )}

      {showTrackPicker && (
        <div className="playlist-picker-overlay" onMouseDown={() => setShowTrackPicker(null)}>
          <div className="playlist-picker" onMouseDown={(e) => e.stopPropagation()}>
            <div className="playlist-picker-header">
              <h3 className="playlist-picker-title">Link to track</h3>
              <button className="playlist-picker-close" onClick={() => setShowTrackPicker(null)}>
                <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
                  <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
                </svg>
              </button>
            </div>
            <div className="playlist-picker-search">
              <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
                <path d="M15.5 14h-.79l-.28-.27C15.41 12.59 16 11.11 16 9.5 16 5.91 13.09 3 9.5 3S3 5.91 3 9.5 5.91 16 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z" />
              </svg>
              <input
                type="text"
                placeholder="Search tracks..."
                value={trackPickerSearch}
                onChange={(e) => setTrackPickerSearch(e.target.value)}
                autoFocus
              />
            </div>
            <div className="playlist-picker-grid">
              {(() => {
                const filtered = tracks.filter((t) =>
                  `${t.title} ${t.artist}`.toLowerCase().includes(trackPickerSearch.toLowerCase())
                );
                return filtered.length === 0 ? (
                  <span className="playlist-picker-empty">No tracks found</span>
                ) : (
                  filtered.map((t) => (
                    <button
                      key={t.path}
                      className="playlist-picker-card"
                      onClick={() => {
                        onLinkVideoToTrack(t.path, showTrackPicker.path);
                        setShowTrackPicker(null);
                        setTrackPickerSearch("");
                      }}
                    >
                      <div className="playlist-picker-card-cover">
                        {t.cover ? (
                          <img src={convertFileSrc(t.cover)} alt="" />
                        ) : (
                          <div className="playlist-picker-card-placeholder">
                            <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor">
                              <path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55C7.79 13 6 14.79 6 17s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z" />
                            </svg>
                          </div>
                        )}
                      </div>
                      <span className="playlist-picker-card-name">{t.title}</span>
                      <span className="playlist-picker-card-meta">{t.artist}</span>
                    </button>
                  ))
                );
              })()}
            </div>
          </div>
        </div>
      )}

      {contextMenu && (
        <ContextMenu
          track={contextMenu.track}
          playlist={playlist}
          playlists={playlists}
          position={{ x: contextMenu.x, y: contextMenu.y }}
          onClose={() => setContextMenu(null)}
          onAddToPlaylist={onAddToPlaylist}
          onRemoveFromPlaylist={onRemoveFromPlaylist}
          onEditTrack={onEditTrack}
          onLinkLrc={onLinkLrc}
          onLinkVideo={onLinkVideo}
        />
      )}
    </div>
  );
}
