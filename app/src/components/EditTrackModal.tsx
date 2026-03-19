import { useState } from "react";
import { convertFileSrc } from "@tauri-apps/api/core";
import { Track } from "../types";

interface EditTrackModalProps {
  track: Track;
  onSave: (
    trackPath: string,
    title: string,
    artist: string,
    album: string,
    coverPath: string | null,
  ) => void;
  onPickCover: () => Promise<string | null>;
  onClose: () => void;
}

export default function EditTrackModal({
  track,
  onSave,
  onPickCover,
  onClose,
}: EditTrackModalProps) {
  const [title, setTitle] = useState(track.title);
  const [artist, setArtist] = useState(track.artist);
  const [album, setAlbum] = useState(track.album);
  const [newCoverPath, setNewCoverPath] = useState<string | null>(null);

  const displayCover = newCoverPath
    ? convertFileSrc(newCoverPath)
    : track.cover
      ? convertFileSrc(track.cover)
      : null;

  async function handlePickCover() {
    const path = await onPickCover();
    if (path) setNewCoverPath(path);
  }

  function handleSave() {
    onSave(track.path, title, artist, album, newCoverPath);
    onClose();
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Edit Metadata</h2>
          <button className="modal-close" onClick={onClose}>
            &times;
          </button>
        </div>

        <div className="modal-body">
          <div className="modal-cover" onClick={handlePickCover}>
            {displayCover ? (
              <img src={displayCover} alt="" />
            ) : (
              <div className="modal-cover-placeholder">
                <svg
                  viewBox="0 0 24 24"
                  width="40"
                  height="40"
                  fill="currentColor"
                >
                  <path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55C7.79 13 6 14.79 6 17s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z" />
                </svg>
              </div>
            )}
            <div className="modal-cover-hint">Change cover</div>
          </div>

          <div className="modal-fields">
            <label>
              <span>Title</span>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </label>
            <label>
              <span>Artist</span>
              <input
                type="text"
                value={artist}
                onChange={(e) => setArtist(e.target.value)}
              />
            </label>
            <label>
              <span>Album</span>
              <input
                type="text"
                value={album}
                onChange={(e) => setAlbum(e.target.value)}
              />
            </label>
          </div>
        </div>

        <div className="modal-footer">
          <button className="modal-btn-cancel" onClick={onClose}>
            Cancel
          </button>
          <button className="modal-btn-save" onClick={handleSave}>
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
