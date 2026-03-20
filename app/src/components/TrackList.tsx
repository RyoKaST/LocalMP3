import { useState, useRef, useEffect, useMemo } from "react";
import { convertFileSrc } from "@tauri-apps/api/core";
import { Track, Playlist } from "../types";

interface TrackListProps {
  tracks: Track[];
  playlist: Playlist | null;
  currentTrack: Track | null;
  isPlaying: boolean;
  playlists: Playlist[];
  onPlay: (track: Track, queue: Track[], source: string) => void;
  onAddToPlaylist: (playlistId: string, track: Track) => void;
  onRemoveFromPlaylist: (playlistId: string, trackPath: string) => void;
  onUpdatePlaylist: (id: string, name?: string, cover?: string) => void;
  onPickCover: (playlistId: string) => void;
  onEditTrack: (track: Track) => void;
  onLinkLrc: (track: Track) => void;
}

function formatDuration(secs: number): string {
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function ContextMenu({
  track,
  playlist,
  playlists,
  position,
  onClose,
  onAddToPlaylist,
  onRemoveFromPlaylist,
  onEditTrack,
  onLinkLrc,
}: {
  track: Track;
  playlist: Playlist | null;
  playlists: Playlist[];
  position: { x: number; y: number };
  onClose: () => void;
  onAddToPlaylist: (playlistId: string, track: Track) => void;
  onRemoveFromPlaylist: (playlistId: string, trackPath: string) => void;
  onEditTrack: (track: Track) => void;
  onLinkLrc: (track: Track) => void;
}) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [showPlaylistSub, setShowPlaylistSub] = useState(false);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [onClose]);

  // Adjust position so menu doesn't overflow viewport
  const style: React.CSSProperties = {
    position: "fixed",
    top: position.y,
    left: position.x,
    zIndex: 1000,
  };

  return (
    <div className="context-menu" style={style} ref={menuRef}>
      <button
        className="context-menu-item"
        onClick={() => {
          onEditTrack(track);
          onClose();
        }}
      >
        <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
          <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z" />
        </svg>
        Edit metadata
      </button>
      <button
        className="context-menu-item"
        onClick={() => {
          onLinkLrc(track);
          onClose();
        }}
      >
        <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
          <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm-1-9c0-.55.45-1 1-1s1 .45 1 1v6c0 .55-.45 1-1 1s-1-.45-1-1V5zm6 6c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z" />
        </svg>
        {track.lrc_path ? "Change LRC file" : "Link LRC file"}
      </button>

      {playlist ? (
        <button
          className="context-menu-item context-menu-danger"
          onClick={() => {
            onRemoveFromPlaylist(playlist.id, track.path);
            onClose();
          }}
        >
          <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
            <path d="M19 13H5v-2h14v2z" />
          </svg>
          Remove from playlist
        </button>
      ) : (
        <div
          className="context-menu-item context-menu-sub-trigger"
          onMouseEnter={() => setShowPlaylistSub(true)}
          onMouseLeave={() => setShowPlaylistSub(false)}
        >
          <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
            <path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z" />
          </svg>
          Add to playlist
          <svg
            viewBox="0 0 24 24"
            width="14"
            height="14"
            fill="currentColor"
            className="context-menu-chevron"
          >
            <path d="M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z" />
          </svg>
          {showPlaylistSub && (
            <div className="context-submenu">
              {playlists.length === 0 ? (
                <span className="context-menu-empty">No playlists yet</span>
              ) : (
                playlists.map((p) => (
                  <button
                    key={p.id}
                    className="context-menu-item"
                    onClick={(e) => {
                      e.stopPropagation();
                      onAddToPlaylist(p.id, track);
                      onClose();
                    }}
                  >
                    {p.name}
                  </button>
                ))
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
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

type ViewMode = "songs" | "albums";

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
}: TrackListProps) {
  const [sortKey, setSortKey] = useState<SortKey>("title");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [searchQuery, setSearchQuery] = useState("");
  const rawTracks = playlist ? playlist.tracks : tracks;

  const filteredTracks = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return rawTracks;
    return rawTracks.filter((t) =>
      t.title.toLowerCase().includes(q) ||
      t.artist.toLowerCase().includes(q) ||
      t.album.toLowerCase().includes(q)
    );
  }, [rawTracks, searchQuery]);

  const displayTracks = sortTracks(filteredTracks, sortKey, sortDir);
  const [contextMenu, setContextMenu] = useState<{
    track: Track;
    x: number;
    y: number;
  } | null>(null);
  const [editingName, setEditingName] = useState<string | null>(null);
  const [nameError, setNameError] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>("songs");
  const [selectedAlbum, setSelectedAlbum] = useState<string | null>(null);

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
    result.sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase()));
    return result;
  }, [filteredTracks]);

  const activeAlbum = useMemo(() => {
    if (!selectedAlbum) return null;
    const album = albums.find((a) => `${a.name.toLowerCase()}::${a.artist.toLowerCase()}` === selectedAlbum);
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
      setSortDir(sortDir === "asc" ? "desc" : "asc");
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
    setContextMenu({ track, x: rect.right, y: rect.bottom + 4 });
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
                <span className="tracklist-title-error">Name cannot be empty</span>
              )}
            </div>
            <span className="tracklist-meta">
              {playlist.tracks.length} track
              {playlist.tracks.length !== 1 ? "s" : ""}
            </span>
          </div>
          <div className="tracklist-search-wrapper">
            <div className="tracklist-search">
              <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
                <path d="M15.5 14h-.79l-.28-.27C15.41 12.59 16 11.11 16 9.5 16 5.91 13.09 3 9.5 3S3 5.91 3 9.5 5.91 16 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z" />
              </svg>
              <input
                type="text"
                placeholder="Search..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
              {searchQuery && (
                <button className="tracklist-search-clear" onClick={() => setSearchQuery("")}>
                  <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor">
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
              <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
                <path d="M15.5 14h-.79l-.28-.27C15.41 12.59 16 11.11 16 9.5 16 5.91 13.09 3 9.5 3S3 5.91 3 9.5 5.91 16 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z" />
              </svg>
              <input
                type="text"
                placeholder="Search..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
              {searchQuery && (
                <button className="tracklist-search-clear" onClick={() => setSearchQuery("")}>
                  <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor">
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
          onClick={() => { setViewMode("songs"); setSelectedAlbum(null); }}
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
      </div>

      {viewMode === "songs" && (
        displayTracks.length === 0 ? (
          <div className="tracklist-empty">
            {playlist
              ? "This playlist is empty. Add tracks from your library."
              : "No tracks found. Select a folder containing audio files."}
          </div>
        ) : (
          <table className="tracklist-table">
            <thead>
              <tr>
                <th className={`col-title sortable ${sortKey === "title" ? "sorted" : ""}`} onClick={() => handleSort("title")}>
                  Title {sortKey === "title" && <span className="sort-arrow">{sortDir === "asc" ? "\u25B2" : "\u25BC"}</span>}
                </th>
                <th className={`col-artist sortable ${sortKey === "artist" ? "sorted" : ""}`} onClick={() => handleSort("artist")}>
                  Artist {sortKey === "artist" && <span className="sort-arrow">{sortDir === "asc" ? "\u25B2" : "\u25BC"}</span>}
                </th>
                <th className={`col-album sortable ${sortKey === "album" ? "sorted" : ""}`} onClick={() => handleSort("album")}>
                  Album {sortKey === "album" && <span className="sort-arrow">{sortDir === "asc" ? "\u25B2" : "\u25BC"}</span>}
                </th>
                <th className={`col-duration sortable ${sortKey === "duration" ? "sorted" : ""}`} onClick={() => handleSort("duration")}>
                  Duration {sortKey === "duration" && <span className="sort-arrow">{sortDir === "asc" ? "\u25B2" : "\u25BC"}</span>}
                </th>
                <th className="col-actions"></th>
              </tr>
            </thead>
            <tbody>
              {displayTracks.map((track, index) => (
                <tr
                  key={track.path + index}
                  className={`tracklist-row ${currentTrack?.path === track.path ? "playing" : ""}`}
                  onDoubleClick={() => onPlay(track, displayTracks, playlist ? playlist.name : "Library")}
                  onContextMenu={(e) => handleContextMenu(track, e)}
                >
                  <td className="col-title">
                    <div className="track-title-cell">
                      <div className="track-cover-small">
                        {track.cover ? (
                          <img
                            src={convertFileSrc(track.cover)}
                            alt=""
                            className={currentTrack?.path === track.path ? "cover-greyed" : ""}
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
                        {currentTrack?.path === track.path && (
                          isPlaying ? (
                            <span className="playing-icon playing-icon-overlay">
                              <span></span>
                              <span></span>
                              <span></span>
                            </span>
                          ) : (
                            <svg className="playing-icon-overlay" viewBox="0 0 24 24" width="20" height="20" fill="var(--accent)">
                              <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
                            </svg>
                          )
                        )}
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
              ))}
            </tbody>
          </table>
        )
      )}

      {viewMode === "albums" && !activeAlbum && (
        albums.length === 0 ? (
          <div className="tracklist-empty">
            {playlist
              ? "This playlist is empty. Add tracks from your library."
              : "No tracks found. Select a folder containing audio files."}
          </div>
        ) : (
          <div className="album-grid">
            {albums.map((album) => {
              const key = `${album.name.toLowerCase()}::${album.artist.toLowerCase()}`;
              const isPlayingAlbum = currentTrack && album.tracks.some((t) => t.path === currentTrack.path);
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
                        <svg viewBox="0 0 24 24" width="32" height="32" fill="currentColor">
                          <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 14.5c-2.49 0-4.5-2.01-4.5-4.5S9.51 7.5 12 7.5s4.5 2.01 4.5 4.5-2.01 4.5-4.5 4.5zm0-5.5c-.55 0-1 .45-1 1s.45 1 1 1 1-.45 1-1-.45-1-1-1z" />
                        </svg>
                      </div>
                    )}
                    <button
                      className="album-card-play"
                      onClick={(e) => {
                        e.stopPropagation();
                        if (album.tracks.length > 0) onPlay(album.tracks[0], album.tracks, album.name);
                      }}
                    >
                      <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor">
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
        )
      )}

      {viewMode === "albums" && activeAlbum && (
        <div className="album-detail">
          <button className="album-detail-back" onClick={() => setSelectedAlbum(null)}>
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
                  <svg viewBox="0 0 24 24" width="40" height="40" fill="currentColor">
                    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 14.5c-2.49 0-4.5-2.01-4.5-4.5S9.51 7.5 12 7.5s4.5 2.01 4.5 4.5-2.01 4.5-4.5 4.5zm0-5.5c-.55 0-1 .45-1 1s.45 1 1 1 1-.45 1-1-.45-1-1-1z" />
                  </svg>
                </div>
              )}
            </div>
            <div className="album-detail-info">
              <span className="tracklist-label">ALBUM</span>
              <h2 className="album-detail-name">{activeAlbum.name}</h2>
              <span className="album-detail-meta">
                {activeAlbum.artist} &middot; {activeAlbum.tracks.length} track{activeAlbum.tracks.length !== 1 ? "s" : ""} &middot; {formatDuration(activeAlbum.totalDuration)}
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
                  onDoubleClick={() => onPlay(track, activeAlbum.tracks, activeAlbum.name)}
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
                  <td className="col-duration">{formatDuration(track.duration)}</td>
                  <td className="col-actions">
                    <button
                      className="dots-btn"
                      onClick={(e) => handleDotsClick(track, e)}
                    >
                      <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
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
        />
      )}
    </div>
  );
}
