import { useState, useRef, useEffect, useLayoutEffect } from "react";
import { Track, Playlist } from "../types";

interface ContextMenuProps {
  track: Track;
  playlist: Playlist | null;
  playlists: Playlist[];
  position: { x: number; y: number };
  onClose: () => void;
  onAddToPlaylist: (playlistId: string, track: Track) => void;
  onRemoveFromPlaylist: (playlistId: string, trackPath: string) => void;
  onEditTrack: (track: Track) => void;
  onLinkLrc: (track: Track) => void;
  onLinkVideo: (track: Track) => void;
  onPlayNext: (track: Track) => void;
  onAddToQueue: (track: Track) => void;
}

function PlaylistPicker({
  track,
  playlists,
  onAddToPlaylist,
  onClose,
}: {
  track: Track;
  playlists: Playlist[];
  onAddToPlaylist: (playlistId: string, track: Track) => void;
  onClose: () => void;
}) {
  const [search, setSearch] = useState("");
  const filtered = playlists.filter((p) =>
    p.name.toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <div className="playlist-picker-overlay" onMouseDown={onClose}>
      <div
        className="playlist-picker"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="playlist-picker-header">
          <h3 className="playlist-picker-title">Add to playlist</h3>
          <button className="playlist-picker-close" onClick={onClose}>
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
            placeholder="Search playlists..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            autoFocus
          />
        </div>
        <div className="playlist-picker-grid">
          {filtered.length === 0 ? (
            <span className="playlist-picker-empty">No playlists found</span>
          ) : (
            filtered.map((p) => (
              <button
                key={p.id}
                className="playlist-picker-card"
                onClick={() => {
                  onAddToPlaylist(p.id, track);
                  onClose();
                }}
              >
                <div className="playlist-picker-card-cover">
                  {p.cover ? (
                    <img src={p.cover} alt="" />
                  ) : (
                    <div className="playlist-picker-card-placeholder">
                      <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor">
                        <path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55C7.79 13 6 14.79 6 17s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z" />
                      </svg>
                    </div>
                  )}
                </div>
                <span className="playlist-picker-card-name">{p.name}</span>
                <span className="playlist-picker-card-meta">
                  {p.tracks.length} track{p.tracks.length !== 1 ? "s" : ""}
                </span>
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

export default function ContextMenu({
  track,
  playlist,
  playlists,
  position,
  onClose,
  onAddToPlaylist,
  onRemoveFromPlaylist,
  onEditTrack,
  onLinkLrc,
  onLinkVideo,
  onPlayNext,
  onAddToQueue,
}: ContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [showPlaylists, setShowPlaylists] = useState(false);
  const [showPicker, setShowPicker] = useState(false);
  const [pos, setPos] = useState(position);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [onClose]);

  useLayoutEffect(() => {
    const menu = menuRef.current;
    if (!menu) return;
    const rect = menu.getBoundingClientRect();
    let x = position.x;
    let y = position.y;
    if (y + rect.height > window.innerHeight) {
      y = position.y - rect.height;
    }
    if (x + rect.width > window.innerWidth) {
      x = position.x - rect.width;
    }
    setPos({ x, y });
  }, [position, showPlaylists]);

  const style: React.CSSProperties = {
    position: "fixed",
    top: pos.y,
    left: pos.x,
    zIndex: 1000,
  };

  const manyPlaylists = playlists.length > 10;

  return (
    <>
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
        <div className="context-menu-separator" />
        <button
          className="context-menu-item"
          onClick={() => {
            onPlayNext(track);
            onClose();
          }}
        >
          <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
            <path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z" />
          </svg>
          Play next
        </button>
        <button
          className="context-menu-item"
          onClick={() => {
            onAddToQueue(track);
            onClose();
          }}
        >
          <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
            <path d="M15 6H3v2h12V6zm0 4H3v2h12v-2zM3 16h8v-2H3v2zM17 6v8.18c-.31-.11-.65-.18-1-.18-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3V8h3V6h-5z" />
          </svg>
          Add to queue
        </button>
        <div className="context-menu-separator" />
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
        <button
          className="context-menu-item"
          onClick={() => {
            onLinkVideo(track);
            onClose();
          }}
        >
          <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
            <path d="M18 4l2 4h-3l-2-4h-2l2 4h-3l-2-4H8l2 4H7L5 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V4h-4z" />
          </svg>
          Link music video
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
          <>
            <button
              className="context-menu-item"
              onClick={() => {
                if (manyPlaylists) {
                  setShowPicker(true);
                } else {
                  setShowPlaylists((s) => !s);
                }
              }}
            >
              <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
                <path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z" />
              </svg>
              Add to playlist
              {!manyPlaylists && (
                <svg
                  viewBox="0 0 24 24"
                  width="14"
                  height="14"
                  fill="currentColor"
                  className={`context-menu-chevron${showPlaylists ? " context-menu-chevron-open" : ""}`}
                >
                  <path d="M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z" />
                </svg>
              )}
            </button>
            {showPlaylists && !manyPlaylists && (
              <div className="context-menu-playlist-list">
                {playlists.length === 0 ? (
                  <span className="context-menu-empty">No playlists yet</span>
                ) : (
                  playlists.map((p) => (
                    <button
                      key={p.id}
                      className="context-menu-item context-menu-playlist-item"
                      onClick={() => {
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
          </>
        )}
      </div>
      {showPicker && (
        <PlaylistPicker
          track={track}
          playlists={playlists}
          onAddToPlaylist={onAddToPlaylist}
          onClose={onClose}
        />
      )}
    </>
  );
}
