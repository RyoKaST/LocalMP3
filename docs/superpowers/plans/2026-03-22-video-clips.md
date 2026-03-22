# Video Clips Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Videos tab to the library that scans for video files, plays them fullscreen, and allows bidirectional linking between videos and audio tracks.

**Architecture:** Videos are scanned from the same library paths as audio. A new `VideoFile` type holds path + title (derived from filename). Video-audio links are stored in `AppData.video_links` as a `HashMap<String, String>` (audio_path -> video_path). The frontend adds a "Videos" third tab in TrackList, a fullscreen `VideoPlayer` component, and linking UX in both directions.

**Tech Stack:** Rust/Tauri backend, React/TypeScript frontend, HTML5 `<video>` element for playback.

---

### Task 1: Backend — VideoFile struct and scan_videos command

**Files:**
- Modify: `app/src-tauri/src/lib.rs`

- [ ] **Step 1: Add VideoFile struct**

After the `Track` struct (~line 24), add:

```rust
#[derive(Serialize, Deserialize, Clone)]
pub struct VideoFile {
    title: String,
    path: String,
    linked_track_path: Option<String>,
}
```

- [ ] **Step 2: Add video_links to AppData**

In the `AppData` struct (~line 34), add a new field:

```rust
#[serde(default)]
video_links: std::collections::HashMap<String, String>,
```

Also add it to the `Default` impl:

```rust
video_links: std::collections::HashMap::new(),
```

- [ ] **Step 3: Add scan_videos command**

```rust
#[tauri::command]
fn scan_videos(app: tauri::AppHandle, path: String) -> Vec<VideoFile> {
    let data = load_data(&app);
    let mut videos = Vec::new();
    for entry in WalkDir::new(&path) {
        let entry = match entry {
            Ok(entry) => entry,
            Err(_) => continue,
        };
        if let Some(ext) = entry.path().extension().and_then(|e| e.to_str()) {
            match ext.to_lowercase().as_str() {
                "mp4" | "mkv" | "webm" | "avi" | "mov" => {
                    let file_path = entry.path().to_string_lossy().to_string();
                    let title = entry
                        .path()
                        .file_stem()
                        .map(|s| s.to_string_lossy().to_string())
                        .unwrap_or_else(|| "Unknown".to_string());
                    // Check if this video is linked to any track (reverse lookup)
                    let linked_track = data
                        .video_links
                        .iter()
                        .find(|(_, v)| **v == file_path)
                        .map(|(k, _)| k.clone());
                    videos.push(VideoFile {
                        title,
                        path: file_path,
                        linked_track_path: linked_track,
                    });
                }
                _ => {}
            }
        }
    }
    videos.sort_by(|a, b| a.title.to_lowercase().cmp(&b.title.to_lowercase()));
    videos
}
```

- [ ] **Step 4: Add link_video and unlink_video commands**

```rust
#[tauri::command]
fn link_video(app: tauri::AppHandle, track_path: String, video_path: String) -> Result<(), String> {
    if !Path::new(&video_path).exists() {
        return Err("Video file does not exist".to_string());
    }
    let mut data = load_data(&app);
    data.video_links.insert(track_path, video_path);
    save_data(&app, &data);
    Ok(())
}

#[tauri::command]
fn unlink_video(app: tauri::AppHandle, track_path: String) {
    let mut data = load_data(&app);
    data.video_links.remove(&track_path);
    save_data(&app, &data);
}

#[tauri::command]
fn get_video_for_track(app: tauri::AppHandle, track_path: String) -> Option<String> {
    let data = load_data(&app);
    data.video_links.get(&track_path).cloned()
}
```

- [ ] **Step 5: Register new commands in the invoke_handler**

Add to the `generate_handler!` macro (~line 547):

```rust
scan_videos,
link_video,
unlink_video,
get_video_for_track,
```

- [ ] **Step 6: Commit**

```
feat: add video scanning and linking backend commands
```

---

### Task 2: Frontend — VideoFile type and video state in App

**Files:**
- Modify: `app/src/types.ts`
- Modify: `app/src/App.tsx`

- [ ] **Step 1: Add VideoFile type**

In `types.ts`, add:

```typescript
export interface VideoFile {
  title: string;
  path: string;
  linked_track_path: string | null;
}
```

- [ ] **Step 2: Add video state and scanning to App.tsx**

Add import of `VideoFile` in the types import. Add state:

```typescript
const [videos, setVideos] = useState<VideoFile[]>([]);
const [activeVideo, setActiveVideo] = useState<string | null>(null); // path of video playing fullscreen
```

- [ ] **Step 3: Add video scanning alongside audio scanning**

Create `scanAllVideos` function similar to `scanAllPaths`:

```typescript
async function scanAllVideos(paths: string[]) {
  const allVideos: VideoFile[] = [];
  for (const p of paths) {
    try {
      const result = await invoke<VideoFile[]>("scan_videos", { path: p });
      allVideos.push(...result);
    } catch (e) {
      console.error(`Failed to scan videos in ${p}:`, e);
    }
  }
  allVideos.sort((a, b) => a.title.toLowerCase().localeCompare(b.title.toLowerCase()));
  setVideos(allVideos);
}
```

Call `scanAllVideos(paths)` alongside `scanAllPaths(paths)` in `loadSavedLibrary`, `addFolder`, and `removeFolder`.

- [ ] **Step 4: Add video linking handlers**

```typescript
async function handleLinkVideo(trackPath: string, videoPath: string) {
  try {
    await invoke("link_video", { trackPath, videoPath });
    // Refresh videos to update linked state
    await scanAllVideos(libraryPaths);
  } catch (e) {
    console.error("Failed to link video:", e);
  }
}

async function handleUnlinkVideo(trackPath: string) {
  try {
    await invoke("unlink_video", { trackPath });
    await scanAllVideos(libraryPaths);
  } catch (e) {
    console.error("Failed to unlink video:", e);
  }
}
```

- [ ] **Step 5: Add getVideoForTrack helper state**

Track the video path for the currently playing track:

```typescript
const [currentTrackVideoPath, setCurrentTrackVideoPath] = useState<string | null>(null);

// Update when currentTrack changes
useEffect(() => {
  if (!currentTrack) {
    setCurrentTrackVideoPath(null);
    return;
  }
  invoke<string | null>("get_video_for_track", { trackPath: currentTrack.path })
    .then(setCurrentTrackVideoPath)
    .catch(() => setCurrentTrackVideoPath(null));
}, [currentTrack]);
```

- [ ] **Step 6: Commit**

```
feat: add video state management and scanning to App
```

---

### Task 3: Frontend — Videos tab in TrackList

**Files:**
- Modify: `app/src/components/TrackList.tsx`

- [ ] **Step 1: Update TrackListProps**

Add to the interface:

```typescript
videos: VideoFile[];
onPlayVideo: (videoPath: string) => void;
onLinkVideoToTrack: (trackPath: string, videoPath: string) => void;
onUnlinkVideo: (trackPath: string) => void;
```

Import `VideoFile` from types. Update `ViewMode`:

```typescript
type ViewMode = "songs" | "albums" | "videos";
```

- [ ] **Step 2: Add Videos tab button**

After the Albums tab button in the `tracklist-view-tabs` div, add:

```tsx
<button
  className={`tracklist-view-tab ${viewMode === "videos" ? "active" : ""}`}
  onClick={() => setViewMode("videos")}
>
  <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
    <path d="M18 4l2 4h-3l-2-4h-2l2 4h-3l-2-4H8l2 4H7L5 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V4h-4z" />
  </svg>
  Videos
</button>
```

- [ ] **Step 3: Add Videos grid view**

After the albums view section, before the context menu section, add the videos view:

```tsx
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
        >
          <div className="album-card-cover">
            <div className="album-card-cover-placeholder video-placeholder">
              <svg viewBox="0 0 24 24" width="32" height="32" fill="currentColor">
                <path d="M18 4l2 4h-3l-2-4h-2l2 4h-3l-2-4H8l2 4H7L5 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V4h-4z" />
              </svg>
            </div>
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
            {video.linked_track_path && (
              <span className="album-card-artist video-linked-badge">Linked</span>
            )}
          </div>
        </div>
      ))}
    </div>
  ))}
```

- [ ] **Step 4: Update TrackList props in App.tsx call site**

Pass the new props to `<TrackList>`:

```tsx
videos={videos}
onPlayVideo={(path) => setActiveVideo(path)}
onLinkVideoToTrack={handleLinkVideo}
onUnlinkVideo={handleUnlinkVideo}
```

- [ ] **Step 5: Update libraryClickBehavior handling**

In the `useEffect` for `libraryResetKey`, add a case for the "videos" behavior or just keep existing behavior (videos tab isn't affected by library click behavior since it's a separate tab).

- [ ] **Step 6: Commit**

```
feat: add Videos tab to TrackList with grid view
```

---

### Task 4: Frontend — VideoPlayer fullscreen component

**Files:**
- Create: `app/src/components/VideoPlayer.tsx`

- [ ] **Step 1: Create VideoPlayer component**

```tsx
import { useState, useRef, useEffect, useCallback } from "react";
import { convertFileSrc } from "@tauri-apps/api/core";

interface VideoPlayerProps {
  videoPath: string;
  onClose: () => void;
}

function formatTime(secs: number): string {
  if (isNaN(secs)) return "0:00";
  const m = Math.floor(secs / 60);
  const s = Math.floor(secs % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export default function VideoPlayer({ videoPath, onClose }: VideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isPlaying, setIsPlaying] = useState(true);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [seekValue, setSeekValue] = useState(0);
  const [volume, setVolume] = useState(1);
  const isSeeking = useRef(false);

  // Animation state
  const [isEntering, setIsEntering] = useState(true);
  const [isClosing, setIsClosing] = useState(false);

  // Auto-hide controls
  const [controlsVisible, setControlsVisible] = useState(true);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Enter animation
  useEffect(() => {
    const raf = requestAnimationFrame(() => setIsEntering(false));
    return () => cancelAnimationFrame(raf);
  }, []);

  // Auto-play on mount
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    video.src = convertFileSrc(videoPath);
    video.play().then(() => setIsPlaying(true)).catch(console.error);
  }, [videoPath]);

  // Video event listeners
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const onTimeUpdate = () => {
      if (!isSeeking.current) {
        setCurrentTime(video.currentTime);
        setSeekValue(video.currentTime);
      }
    };
    const onDurationChange = () => setDuration(video.duration);
    const onEnded = () => setIsPlaying(false);

    video.addEventListener("timeupdate", onTimeUpdate);
    video.addEventListener("durationchange", onDurationChange);
    video.addEventListener("ended", onEnded);

    return () => {
      video.removeEventListener("timeupdate", onTimeUpdate);
      video.removeEventListener("durationchange", onDurationChange);
      video.removeEventListener("ended", onEnded);
    };
  }, []);

  // Escape to close
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") handleClose();
      if (e.code === "Space") {
        e.preventDefault();
        togglePlayPause();
      }
      showControls();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  // Auto-hide controls
  const showControls = useCallback(() => {
    setControlsVisible(true);
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    hideTimerRef.current = setTimeout(() => setControlsVisible(false), 3000);
  }, []);

  useEffect(() => {
    showControls();
    return () => {
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    };
  }, [showControls]);

  function togglePlayPause() {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) {
      video.play().then(() => setIsPlaying(true)).catch(console.error);
    } else {
      video.pause();
      setIsPlaying(false);
    }
  }

  const handleSeekStart = useCallback(() => { isSeeking.current = true; }, []);
  const handleSeekChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value);
    setSeekValue(val);
    setCurrentTime(val);
  }, []);
  const handleSeekEnd = useCallback(() => {
    if (videoRef.current) videoRef.current.currentTime = seekValue;
    isSeeking.current = false;
  }, [seekValue]);
  const handleVolumeChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const v = parseFloat(e.target.value);
    setVolume(v);
    if (videoRef.current) videoRef.current.volume = v;
  }, []);

  const handleClose = useCallback(() => {
    if (isClosing) return;
    setIsClosing(true);
  }, [isClosing]);

  const handleTransitionEnd = useCallback(() => {
    if (isClosing) {
      if (videoRef.current) {
        videoRef.current.pause();
        videoRef.current.src = "";
      }
      onClose();
    }
  }, [isClosing, onClose]);

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

  const overlayClass = [
    "fs-overlay video-player-overlay",
    isEntering ? "fs-entering" : "",
    isClosing ? "fs-closing" : "",
  ].filter(Boolean).join(" ");

  return (
    <div
      className={overlayClass}
      onMouseMove={showControls}
      onTransitionEnd={handleTransitionEnd}
    >
      <div className="video-player-bg" />
      <video
        ref={videoRef}
        className="video-player-video"
        onClick={togglePlayPause}
      />
      <button
        className={`video-player-close${controlsVisible ? "" : " hidden"}`}
        onClick={handleClose}
      >
        <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor">
          <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
        </svg>
      </button>
      <div className={`fs-controls video-player-controls${controlsVisible ? "" : " hidden"}`}>
        <div className="fs-progress">
          <span className="fs-time">{formatTime(currentTime)}</span>
          <input
            type="range"
            min="0"
            max={duration || 0}
            step="0.1"
            value={seekValue}
            onMouseDown={handleSeekStart}
            onChange={handleSeekChange}
            onMouseUp={handleSeekEnd}
            className="fs-progress-slider"
            style={{ "--progress": `${progress}%` } as React.CSSProperties}
          />
          <span className="fs-time">{formatTime(duration)}</span>
        </div>
        <div className="fs-buttons">
          <button className="fs-btn fs-btn-play" onClick={togglePlayPause}>
            {isPlaying ? (
              <svg viewBox="0 0 24 24" width="36" height="36" fill="currentColor">
                <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" width="36" height="36" fill="currentColor">
                <path d="M8 5v14l11-7z" />
              </svg>
            )}
          </button>
        </div>
        <div className="fs-volume">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
            <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02z" />
          </svg>
          <input
            type="range"
            min="0"
            max="1"
            step="0.01"
            value={volume}
            onChange={handleVolumeChange}
            className="fs-volume-slider"
          />
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```
feat: add VideoPlayer fullscreen component
```

---

### Task 5: Frontend — VideoPlayer CSS

**Files:**
- Modify: `app/src/App.css`

- [ ] **Step 1: Add video player styles**

Append to App.css:

```css
/* ===== Video Player ===== */
.video-player-overlay {
  cursor: none;
}

.video-player-overlay:hover {
  cursor: default;
}

.video-player-bg {
  position: absolute;
  inset: 0;
  background: #000;
  z-index: 0;
}

.video-player-video {
  position: relative;
  z-index: 1;
  width: 100%;
  height: 100%;
  object-fit: contain;
  cursor: pointer;
}

.video-player-close {
  position: absolute;
  top: 16px;
  right: 16px;
  z-index: 10;
  width: 40px;
  height: 40px;
  border-radius: 50%;
  border: none;
  background: rgba(0, 0, 0, 0.6);
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: opacity 0.3s, background 0.15s;
}

.video-player-close:hover {
  background: rgba(0, 0, 0, 0.8);
}

.video-player-close.hidden {
  opacity: 0;
  pointer-events: none;
}

.video-player-controls {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  z-index: 10;
  background: linear-gradient(transparent, rgba(0, 0, 0, 0.8));
  padding: 40px 24px 20px;
  transition: opacity 0.3s;
}

.video-player-controls.hidden {
  opacity: 0;
  pointer-events: none;
}

.video-linked-badge {
  color: var(--accent) !important;
  font-size: 11px !important;
}
```

- [ ] **Step 2: Commit**

```
feat: add VideoPlayer CSS styles
```

---

### Task 6: Frontend — Wire VideoPlayer into App.tsx

**Files:**
- Modify: `app/src/App.tsx`

- [ ] **Step 1: Import and render VideoPlayer**

Add import:

```typescript
import VideoPlayer from "./components/VideoPlayer";
```

Render it conditionally at the bottom of the App return, after the `FullscreenPlayer`:

```tsx
{activeVideo && (
  <VideoPlayer
    videoPath={activeVideo}
    onClose={() => setActiveVideo(null)}
  />
)}
```

- [ ] **Step 2: Commit**

```
feat: wire VideoPlayer into App layout
```

---

### Task 7: Frontend — "Link music video" in audio track context menu

**Files:**
- Modify: `app/src/components/ContextMenu.tsx`
- Modify: `app/src/App.tsx`

- [ ] **Step 1: Add onLinkVideo prop to ContextMenu**

Update the `ContextMenuProps` interface:

```typescript
onLinkVideo: (track: Track) => void;
currentTrackVideoPath?: string | null;
onUnlinkVideo?: (trackPath: string) => void;
```

- [ ] **Step 2: Add "Link music video" menu item**

After the "Link LRC file" button in `ContextMenu`, add:

```tsx
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
```

- [ ] **Step 3: Add handleLinkVideoFile in App.tsx**

This opens a file picker for video files and links the result:

```typescript
async function handleLinkVideoFile(track: Track) {
  const file = await open({
    filters: [{ name: "Videos", extensions: ["mp4", "mkv", "webm", "avi", "mov"] }],
  });
  if (file) {
    await handleLinkVideo(track.path, file as string);
  }
}
```

- [ ] **Step 4: Pass onLinkVideo to ContextMenu instances**

Pass `onLinkVideo={handleLinkVideoFile}` to all `<ContextMenu>` instances (in TrackList and Player).

- [ ] **Step 5: Commit**

```
feat: add "Link music video" option to audio track context menu
```

---

### Task 8: Frontend — "Link to track" from Videos tab context menu

**Files:**
- Modify: `app/src/components/TrackList.tsx`

- [ ] **Step 1: Add video context menu state and handler**

Add state for video context menu:

```typescript
const [videoContextMenu, setVideoContextMenu] = useState<{
  video: VideoFile;
  x: number;
  y: number;
} | null>(null);
```

- [ ] **Step 2: Add right-click handler to video cards**

On each video card div, add:

```tsx
onContextMenu={(e) => {
  e.preventDefault();
  setVideoContextMenu({ video, x: e.clientX, y: e.clientY });
}}
```

- [ ] **Step 3: Add TrackPicker component**

Add a `TrackPicker` inline component (similar to `PlaylistPicker` in ContextMenu) that shows a searchable list of all tracks:

```tsx
function TrackPicker({
  tracks,
  onSelect,
  onClose,
}: {
  tracks: Track[];
  onSelect: (track: Track) => void;
  onClose: () => void;
}) {
  const [search, setSearch] = useState("");
  const filtered = tracks.filter((t) =>
    `${t.title} ${t.artist}`.toLowerCase().includes(search.toLowerCase())
  );
  return (
    <div className="playlist-picker-overlay" onMouseDown={onClose}>
      <div className="playlist-picker" onMouseDown={(e) => e.stopPropagation()}>
        <div className="playlist-picker-header">
          <h3 className="playlist-picker-title">Link to track</h3>
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
            placeholder="Search tracks..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            autoFocus
          />
        </div>
        <div className="playlist-picker-grid">
          {filtered.length === 0 ? (
            <span className="playlist-picker-empty">No tracks found</span>
          ) : (
            filtered.map((t) => (
              <button
                key={t.path}
                className="playlist-picker-card"
                onClick={() => {
                  onSelect(t);
                  onClose();
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
          )}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Render video context menu and track picker**

Add state for showing the track picker:

```typescript
const [showTrackPicker, setShowTrackPicker] = useState<VideoFile | null>(null);
```

Render a simple context menu for videos:

```tsx
{videoContextMenu && (
  <div
    className="context-menu"
    style={{ position: "fixed", top: videoContextMenu.y, left: videoContextMenu.x, zIndex: 1000 }}
  >
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
)}

{showTrackPicker && (
  <TrackPicker
    tracks={tracks}
    onSelect={(track) => {
      onLinkVideoToTrack(track.path, showTrackPicker.path);
      setShowTrackPicker(null);
    }}
    onClose={() => setShowTrackPicker(null)}
  />
)}
```

- [ ] **Step 5: Close video context menu on outside click**

Add an effect to close on outside click (similar to audio context menu):

```typescript
useEffect(() => {
  if (!videoContextMenu) return;
  const handler = () => setVideoContextMenu(null);
  document.addEventListener("mousedown", handler);
  return () => document.removeEventListener("mousedown", handler);
}, [videoContextMenu]);
```

- [ ] **Step 6: Commit**

```
feat: add video-to-track linking from Videos tab context menu
```

---

### Task 9: Frontend — Video icon in Player bar for linked tracks

**Files:**
- Modify: `app/src/components/Player.tsx`
- Modify: `app/src/App.tsx`

- [ ] **Step 1: Add video props to Player**

Update `PlayerProps`:

```typescript
currentTrackVideoPath: string | null;
onPlayVideo: (videoPath: string) => void;
```

- [ ] **Step 2: Add video button in Player**

In the `player-volume` div, before the lyrics toggle button, add:

```tsx
{currentTrack && currentTrackVideoPath && (
  <button
    className="player-btn player-btn-mode"
    onClick={() => onPlayVideo(currentTrackVideoPath)}
    title="Watch music video"
  >
    <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
      <path d="M18 4l2 4h-3l-2-4h-2l2 4h-3l-2-4H8l2 4H7L5 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V4h-4z" />
    </svg>
  </button>
)}
```

- [ ] **Step 3: Pass props from App.tsx**

In the `<Player>` component call in App.tsx, add:

```tsx
currentTrackVideoPath={currentTrackVideoPath}
onPlayVideo={(path) => setActiveVideo(path)}
```

- [ ] **Step 4: Commit**

```
feat: add music video button to Player bar for linked tracks
```

---

### Task 10: Integration — Pass all new props through and test

**Files:**
- Modify: `app/src/App.tsx` (final wiring)

- [ ] **Step 1: Ensure all ContextMenu instances receive onLinkVideo**

Both the `ContextMenu` in `TrackList` and `Player` need the `onLinkVideo` prop passed through.

For `TrackList`, add `onLinkVideo` to `TrackListProps` and pass it to `<ContextMenu>`.

For `Player`, add `onLinkVideo` to `PlayerProps` and pass it to `<ContextMenu>`.

From `App.tsx`, pass `onLinkVideo={handleLinkVideoFile}` to both `<TrackList>` and `<Player>`.

- [ ] **Step 2: Verify build compiles**

Run: `cd app && npm run build`
Expected: No TypeScript errors.

- [ ] **Step 3: Manual test checklist**

- Videos tab appears as third tab in Library
- Video files from library folders appear in the grid
- Double-clicking a video opens fullscreen player
- Fullscreen video player has play/pause, seek, volume, close
- Escape key closes the video player
- Right-click video -> "Link to track" shows track picker
- Right-click audio track -> "Link music video" opens file picker
- When playing an audio track with linked video, film icon appears in Player bar
- Clicking film icon opens fullscreen video player

- [ ] **Step 4: Commit**

```
feat: complete video clips integration with linking support
```
