import { useState } from "react";
import { Playlist } from "../types";

interface SidebarProps {
  playlists: Playlist[];
  currentView: string;
  onViewChange: (view: string) => void;
  onCreatePlaylist: (name: string) => void;
  onDeletePlaylist: (id: string) => void;
}

export default function Sidebar({
  playlists,
  currentView,
  onViewChange,
  onCreatePlaylist,
  onDeletePlaylist,
}: SidebarProps) {
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);

  function handleCreate() {
    const name = `Playlist #${playlists.length + 1}`;
    onCreatePlaylist(name);
  }

  return (
    <>
    <div className="sidebar">
      <div className="sidebar-logo">
        <svg viewBox="0 0 24 24" width="32" height="32" fill="currentColor">
          <path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55C7.79 13 6 14.79 6 17s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z" />
        </svg>
        <span>LocalMP3</span>
      </div>

      <div className="sidebar-section">
        <button
          className={`sidebar-item ${currentView === "library" ? "active" : ""}`}
          onClick={() => onViewChange("library")}
        >
          <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
            <path d="M4 6h16v2H4zm0 5h16v2H4zm0 5h16v2H4z" />
          </svg>
          Library
        </button>
        <button
          className={`sidebar-item ${currentView === "lrc-creator" ? "active" : ""}`}
          onClick={() => onViewChange("lrc-creator")}
        >
          <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
            <path d="M14 2H6c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V8l-6-6zM6 20V4h7v5h5v11H6zm2-6h8v2H8v-2zm0-3h8v2H8v-2z" />
          </svg>
          LRC Creator
        </button>
        <button
          className={`sidebar-item ${currentView === "settings" ? "active" : ""}`}
          onClick={() => onViewChange("settings")}
        >
          <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
            <path d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58a.49.49 0 00.12-.61l-1.92-3.32a.488.488 0 00-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54a.484.484 0 00-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.07.62-.07.94s.02.64.07.94l-2.03 1.58a.49.49 0 00-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z" />
          </svg>
          Settings
        </button>
      </div>

      <div className="sidebar-divider" />

      <div className="sidebar-section">
        <div className="sidebar-header">
          <span>Playlists</span>
          <button
            className="sidebar-add-btn"
            onClick={handleCreate}
          >
            <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
              <path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z" />
            </svg>
          </button>
        </div>

        <div className="sidebar-playlists">
          {playlists.map((playlist) => (
            <div
              key={playlist.id}
              className={`sidebar-playlist ${currentView === playlist.id ? "active" : ""}`}
              onClick={() => onViewChange(playlist.id)}
            >
              <div className="sidebar-playlist-cover">
                {playlist.cover ? (
                  <img src={playlist.cover} alt="" />
                ) : (
                  <svg
                    viewBox="0 0 24 24"
                    width="24"
                    height="24"
                    fill="currentColor"
                  >
                    <path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55C7.79 13 6 14.79 6 17s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z" />
                  </svg>
                )}
              </div>
              <div className="sidebar-playlist-info">
                <span className="sidebar-playlist-name">{playlist.name}</span>
                <span className="sidebar-playlist-count">
                  {playlist.tracks.length} track
                  {playlist.tracks.length !== 1 ? "s" : ""}
                </span>
              </div>
              <button
                className="sidebar-playlist-delete"
                onClick={(e) => {
                  e.stopPropagation();
                  setPendingDeleteId(playlist.id);
                }}
              >
                &times;
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>

    {pendingDeleteId && (() => {
      const playlist = playlists.find((p) => p.id === pendingDeleteId);
      return (
        <div className="modal-overlay" onClick={() => setPendingDeleteId(null)}>
          <div className="confirm-modal" onClick={(e) => e.stopPropagation()}>
            <div className="confirm-modal-icon">
              <svg viewBox="0 0 24 24" width="28" height="28" fill="currentColor">
                <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/>
              </svg>
            </div>
            <h2 className="confirm-modal-title">Delete playlist</h2>
            <p className="confirm-modal-body">
              Are you sure you want to delete <strong>{playlist?.name}</strong>?<br />
              This action cannot be undone.
            </p>
            <div className="confirm-modal-actions">
              <button className="confirm-modal-cancel" onClick={() => setPendingDeleteId(null)}>
                Cancel
              </button>
              <button
                className="confirm-modal-confirm"
                onClick={() => {
                  onDeletePlaylist(pendingDeleteId);
                  setPendingDeleteId(null);
                }}
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      );
    })()}
    </>
  );
}
