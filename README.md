# LocalMP3

A local-first desktop music player built with Tauri, React, and Rust. Manage your music library, create and sync lyrics, link music videos, and customize your listening experience — all offline, all yours.

**Supported platforms:** Windows, macOS (Intel & Apple Silicon), Linux

## Table of Contents

- [Installation](#installation)
- [Getting Started](#getting-started)
- [Features](#features)
  - [Library Management](#library-management)
  - [Playback](#playback)
  - [Playlists](#playlists)
  - [Lyrics (LRC)](#lyrics-lrc)
  - [Video Player](#video-player)
  - [Fullscreen Player](#fullscreen-player)
  - [Metadata Editing](#metadata-editing)
  - [Duplicate Detection](#duplicate-detection)
  - [Appearance & Customization](#appearance--customization)
- [Keyboard Shortcuts](#keyboard-shortcuts)
- [Supported Formats](#supported-formats)
- [Data Storage](#data-storage)
- [License](#license)

---

## Installation

Head to the [Releases](../../releases) page and download the installer for your OS:

| Platform | File |
|----------|------|
| Windows | `.msi` or `.exe` |
| macOS | `.dmg` |
| Linux | `.AppImage` or `.deb` |

FFmpeg is bundled with the app — no extra setup needed.

> **macOS users:** If macOS says the app is "damaged" or can't be opened, run this in Terminal:
> ```bash
> xattr -cr /Applications/LocalMP3.app
> ```
> This removes the quarantine flag that macOS adds to apps downloaded from the internet. The app is not signed with an Apple Developer certificate, which triggers this warning.

---

## Getting Started

1. **Launch the app** and you'll see an empty library.
2. **Add a music directory:** Go to **Settings** (gear icon) → **Directories** tab → click **Add directory** and select the folder containing your music files.
3. The app scans the folder recursively and loads all supported audio files with their metadata and cover art.
4. You can add multiple directories. To rescan, remove and re-add the directory.
5. Start playing by clicking any track in the library.

---

## Features

### Library Management

#### Songs Tab
The default view shows all your tracks in a sortable list. Click any column header to sort by **Title**, **Artist**, **Album**, or **Duration**. Click again to reverse the order.

Use the **search bar** at the top to filter tracks by title, artist, or album — filtering is instant as you type.

#### Albums Tab
Switch to the **Albums** tab to browse by album. Each album card shows the cover art, album name, artist, and track count. Click an album to see its tracks sorted by track number.

#### Videos Tab
Shows all video files found in your library directories. Videos can be linked to audio tracks (see [Video Player](#video-player)).

#### Library Click Behavior
In **Settings → Experience**, you can configure what happens when you click "Library" in the sidebar:
- **Keep current tab** — stays on whichever tab (Songs/Albums) you were on
- **Always show Songs** — resets to the Songs tab
- **Always show Albums** — resets to the Albums tab

---

### Playback

Click any track to start playing. The player bar at the bottom shows:

- **Left:** Cover art, track title, artist, and playback source (Library or playlist name)
- **Center:** Playback controls and progress/seek bar
- **Right:** Video, lyrics, and more options buttons, plus volume slider

#### Controls
- **Shuffle:** Randomizes playback order. The next track is picked randomly from the remaining queue.
- **Previous / Next:** Navigate through the queue. In repeat-all mode, wraps around.
- **Repeat modes** (cycle by clicking):
  - **Off** — stops at the end of the queue
  - **Repeat All** — loops the entire queue
  - **Repeat One** — loops the current track

#### Volume
Use the slider on the right side of the player bar.

---

### Playlists

#### Creating a Playlist
Click the **+** button in the sidebar under "Playlists." A new playlist is created with a default name you can edit.

#### Adding Tracks
- Click the **three-dot menu** (⋯) on any track → **Add to playlist** → select the target playlist
- If you have more than 10 playlists, a search modal appears to help you find the right one

#### Reordering Tracks
1. Open a playlist and click the **Reorder** button in the header
2. Drag tracks using the handle on the left side of each row
3. Drop at the desired position — a blue indicator shows where the track will land
4. Click **Reorder** again to exit reorder mode

#### Editing a Playlist
- **Rename:** Click the playlist name in the header to edit it inline
- **Change cover:** Click the cover art in the playlist header and pick an image

#### Deleting a Playlist
Right-click the playlist in the sidebar or use the delete button. If a track from that playlist is currently playing, the behavior depends on your setting in **Settings → Experience → Playlist delete behavior**:
- **Find another playlist** — switches to another playlist containing the same track
- **Continue from library** — keeps playing but switches context to the library
- **Stop playback** — pauses and clears the current track

---

### Lyrics (LRC)

LocalMP3 supports synchronized lyrics in standard [LRC format](https://en.wikipedia.org/wiki/LRC_(file_format)).

#### Automatic Detection
If an `.lrc` file with the same name as your audio file exists in the same directory (e.g., `song.mp3` → `song.lrc`), it's automatically linked during library scan.

#### Manual Linking
Click the **lyrics button** in the player bar (or three-dot menu → **Link LRC file**) and select an `.lrc` file from your filesystem.

#### Lyrics Display
When lyrics are linked and the panel is open:
- The **current line is highlighted** and auto-scrolls
- **Click any line** to seek to that timestamp
- Adjust **playback speed** (0.5x–2.0x) with the speed slider — useful if you have slowed down or sped up songs like I do.
- Speed is saved per track

#### Close on Click Outside
By default, clicking outside the lyrics panel closes it. Toggle this in **Settings → Experience**.

#### LRC Manager
Open the **LRC Manager** from the sidebar for batch lyrics management:

**Finder Tab — Online Search**
1. The list shows all tracks **without lyrics**
2. Use the search bar to filter, or click **Select All**
3. Click **Search** to query [lrclib.net](https://lrclib.net) for matching lyrics
4. Results show status badges: synced (best), plain text, or not found
5. Click **Save** next to any result to download and auto-link the `.lrc` file

**Manual Tab**
1. Paste LRC-formatted text directly
2. Choose a save location
3. The file is saved and linked to the track

#### Unlinking Lyrics
Use the close/unlink button in the lyrics panel, or three-dot menu → **Unlink LRC**.

---

### Video Player

Link music videos to their corresponding audio tracks for a combined experience.

#### Linking a Video
- Three-dot menu → **Link music video** → select a video file
- Or from the **Videos tab**: right-click a video → **Link to track** → search and select the audio track

#### Playing a Video
When a track has a linked video, a **video button** appears in the player bar. Click it to open the video player overlay.

#### Audio Source Toggle
The video player has a unique dual-audio feature:
- **Track audio** — plays the high-quality audio file
- **Video audio** — plays the audio embedded in the video

Toggle between them with the audio source button during playback.

#### Audio-Video Sync Offset
If the audio and video are slightly out of sync:
- Use the **offset buttons** (-1s, -0.1s, +0.1s, +1s) to adjust
- A visual marker on the seek bar shows the current offset
- The offset is saved per video and persists across sessions

#### Video Conversion
Some video formats (MKV, WebM, AVI) may not play natively in the app. LocalMP3 automatically converts them to MP4 using the bundled FFmpeg. The converted file is cached so conversion only happens once.

#### Unlinking a Video
Three-dot menu → **Unlink video**, or right-click in the Videos tab.

---

### Fullscreen Player

Click the **cover art** in the player bar to enter fullscreen mode. Press **Escape** or click the **X** button to exit.

#### Layouts
Choose from three layouts in **Settings → Appearances**:

- **Side-by-Side** (default) — cover art on the left, lyrics on the right. Without lyrics, shows a centered cover.
- **Cover** — large centered album art with compact lyrics below.
- **Karaoke** — small cover art in the corner with large karaoke-style lyrics as the main focus.

#### Backgrounds
- **Blurred Cover** (default) — a blurred version of the album art fills the background.
- **Color Gradient** — extracts dominant colors from the cover art and creates a matching gradient.
- **Dark Glow** — dark background with a subtle accent-colored glow.

#### Controls Display
- **Full** (default) — all controls visible: progress bar, play/pause, skip, shuffle, repeat, volume.
- **Minimal** — only play/pause and skip buttons.
- **Auto-hide** — controls fade after 3 seconds of inactivity and reappear on mouse movement.

---

### Metadata Editing

Right-click a track (or three-dot menu → **Edit metadata**) to open the editor. You can change:

- **Title**
- **Artist**
- **Album**
- **Cover art** — click the cover image to pick a new one from your filesystem

Changes are written directly to the audio file's tags and reflected immediately everywhere in the app.

---

### Duplicate Detection

Go to **Settings → Duplicates** to find duplicate tracks in your library:

- **Exact duplicates:** Same title AND artist found in different directories. Useful for catching accidentally imported copies.
- **Probable duplicates:** Same title in different directories (artist may differ). Helps spot remixes, live versions, or near-duplicates.

Each group shows the file path and duration. You can delete unwanted copies directly from this view.

---

### Appearance & Customization

Open **Settings → Appearances** to personalize the app:

#### Theme
Switch between **Dark** (default) and **Light** mode.

#### Accent Color
Pick from 8 presets (green, blue, purple, pink, red, orange, yellow, teal) or use the **custom color picker** to choose any color. The accent color is used throughout the UI for highlights, buttons, and active states.

---

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Space` | Play / Pause |
| `Escape` | Exit fullscreen or video player |

---

## Supported Formats

### Audio
MP3, FLAC, OGG, WAV, M4A, AAC, WMA

### Video
MP4, MKV, WebM, AVI, MOV
(MKV, WebM, and AVI are auto-converted to MP4 for playback)

### Lyrics
LRC (synchronized lyrics format)

### Cover Art
PNG, JPEG, WebP

---

## Data Storage

All app data is stored locally on your machine:

| OS | Location |
|----|----------|
| Windows | `%APPDATA%/LocalMP3` |
| macOS | `~/Library/Application Support/com.ryokast.localmp3` |
| Linux | `~/.local/share/com.ryokast.localmp3` |

This includes:
- Playlists and their track lists
- Library directory paths
- LRC file links and per-track speed settings
- Video links and per-video offset settings
- Cached cover art and converted videos

No data is sent to any server. The only network request the app makes is to [lrclib.net](https://lrclib.net) when you search for lyrics in the LRC Manager.

---

## License

[MIT](LICENSE) — RyoKaST
