import { useState, useEffect, useRef, useCallback, lazy, Suspense } from "react";
import { invoke, convertFileSrc } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import Sidebar from "./components/Sidebar";
import TrackList from "./components/TrackList";
import Player from "./components/Player";
import EditTrackModal from "./components/EditTrackModal";
import Settings, { type PlaylistDeleteBehavior, type LibraryClickBehavior, type FullscreenLayout, type FullscreenBackground, type FullscreenControls, type PrevButtonBehavior } from "./components/Settings";
import LrcCreator from "./components/LrcCreator";
import Lyrics from "./components/Lyrics";
import FullscreenPlayer from "./components/FullscreenPlayer";
const VideoPlayer = lazy(() => import("./components/VideoPlayer"));
import { Track, Playlist, VideoFile } from "./types";
import "./App.css";

function App() {
  const [tracks, setTracks] = useState<Track[]>([]);
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [currentView, setCurrentView] = useState("library");
  const [currentTrack, setCurrentTrack] = useState<Track | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [queue, setQueue] = useState<Track[]>([]);
  const [queueIndex, setQueueIndex] = useState(0);
  const [editingTrack, setEditingTrack] = useState<Track | null>(null);
  const [shuffle, setShuffle] = useState(false);
  const [repeat, setRepeat] = useState<"off" | "all" | "one">("off");
  const [lyricsVisible, setLyricsVisible] = useState(false);
  const [playSource, setPlaySource] = useState<string | null>(null);
  const [userQueue, setUserQueue] = useState<Track[]>([]);
  const [playingFromUserQueue, setPlayingFromUserQueue] = useState(false);
  const [accentColor, setAccentColor] = useState(() => localStorage.getItem("accentColor") || "#1db954");
  const [theme, setTheme] = useState<"dark" | "light">(() => (localStorage.getItem("theme") as "dark" | "light") || "dark");
  const [libraryPaths, setLibraryPaths] = useState<string[]>([]);
  const [playlistDeleteBehavior, setPlaylistDeleteBehavior] = useState<PlaylistDeleteBehavior>(
    () => (localStorage.getItem("playlistDeleteBehavior") as PlaylistDeleteBehavior) || "library"
  );
  const [lyricsCloseOnClickOutside, setLyricsCloseOnClickOutside] = useState(
    () => localStorage.getItem("lyricsCloseOnClickOutside") !== "false"
  );
  const [libraryClickBehavior, setLibraryClickBehavior] = useState<LibraryClickBehavior>(
    () => (localStorage.getItem("libraryClickBehavior") as LibraryClickBehavior) || "keep"
  );
  const [libraryResetKey, setLibraryResetKey] = useState(0);
  const [fullscreenVisible, setFullscreenVisible] = useState(false);
  const [fullscreenLayout, setFullscreenLayout] = useState<FullscreenLayout>(
    () => (localStorage.getItem("fullscreenLayout") as FullscreenLayout) || "side-by-side"
  );
  const [fullscreenBackground, setFullscreenBackground] = useState<FullscreenBackground>(
    () => (localStorage.getItem("fullscreenBackground") as FullscreenBackground) || "blurred-cover"
  );
  const [fullscreenControls, setFullscreenControls] = useState<FullscreenControls>(
    () => (localStorage.getItem("fullscreenControls") as FullscreenControls) || "auto-hide"
  );
  const [prevButtonBehavior, setPrevButtonBehavior] = useState<PrevButtonBehavior>(
    () => (localStorage.getItem("prevButtonBehavior") as PrevButtonBehavior) || "restart-first"
  );
  const [videos, setVideos] = useState<VideoFile[]>([]);
  const [activeVideo, setActiveVideo] = useState<string | null>(null);
  const [activeVideoLinked, setActiveVideoLinked] = useState(false);
  const [currentTrackVideoPath, setCurrentTrackVideoPath] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const videoActiveRef = useRef(false);
  const [updateAvailable, setUpdateAvailable] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function checkUpdate() {
      try {
        const { check } = await import("@tauri-apps/plugin-updater");
        const update = await check();
        if (!cancelled && update) setUpdateAvailable(true);
      } catch { /* ignore */ }
    }
    checkUpdate();
    const interval = setInterval(checkUpdate, 30 * 60 * 1000);
    return () => { cancelled = true; clearInterval(interval); };
  }, []);

  useEffect(() => {
    audioRef.current = new Audio();
    loadPlaylists();
    loadSavedLibrary();
    return () => {
      audioRef.current?.pause();
    };
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    root.setAttribute("data-theme", theme);
    localStorage.setItem("theme", theme);
  }, [theme]);

  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty("--accent", accentColor);
    root.style.setProperty("--accent-hover", accentColor);
    localStorage.setItem("accentColor", accentColor);
  }, [accentColor]);

  async function scanAllPaths(paths: string[]) {
    const allTracks: Track[] = [];
    for (const p of paths) {
      try {
        const result = await invoke<Track[]>("scan_library", { path: p });
        allTracks.push(...result);
      } catch (e) {
        console.error(`Failed to scan ${p}:`, e);
      }
    }
    allTracks.sort((a, b) => a.title.toLowerCase().localeCompare(b.title.toLowerCase()));
    setTracks(allTracks);
  }

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

  async function loadSavedLibrary() {
    try {
      const paths = await invoke<string[]>("get_library_paths");
      setLibraryPaths(paths);
      if (paths.length > 0) {
        await scanAllPaths(paths);
        await scanAllVideos(paths);
      }
    } catch (e) {
      console.error("Failed to load library:", e);
    }
  }

  async function loadPlaylists() {
    try {
      const result = await invoke<Playlist[]>("get_playlists");
      setPlaylists(result);
    } catch (e) {
      console.error("Failed to load playlists:", e);
    }
  }

  async function addFolder() {
    const folder = await open({ directory: true });
    if (folder) {
      try {
        const paths = await invoke<string[]>("add_library_path", { path: folder });
        setLibraryPaths(paths);
        await scanAllPaths(paths);
        await scanAllVideos(paths);
      } catch (e) {
        console.error("Add folder error:", e);
      }
    }
  }

  async function removeFolder(path: string) {
    try {
      const paths = await invoke<string[]>("remove_library_path", { path });
      setLibraryPaths(paths);
      await scanAllPaths(paths);
      await scanAllVideos(paths);
    } catch (e) {
      console.error("Remove folder error:", e);
    }
  }

  function playTrack(track: Track, trackQueue: Track[], source: string) {
    const audio = audioRef.current;
    if (!audio) return;

    if (source !== playSource) {
      setUserQueue([]);
    }

    const idx = trackQueue.findIndex((t) => t.path === track.path);
    setQueue(trackQueue);
    setQueueIndex(idx >= 0 ? idx : 0);
    setCurrentTrack(track);
    setPlaySource(source);
    setPlayingFromUserQueue(false);

    audio.src = convertFileSrc(track.path);
    audio.play().then(() => setIsPlaying(true)).catch(console.error);
  }

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.code === "Space" && !(e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement)) {
        e.preventDefault();
        togglePlayPause();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  });

  function togglePlayPause() {
    const audio = audioRef.current;
    if (!audio || !currentTrack) return;
    if (isPlaying) {
      audio.pause();
      setIsPlaying(false);
    } else {
      audio.play().then(() => setIsPlaying(true)).catch(console.error);
    }
  }

  function playNext() {
    const audio = audioRef.current;
    if (!audio) return;

    if (userQueue.length > 0) {
      const next = userQueue[0];
      setUserQueue((prev) => prev.slice(1));
      setCurrentTrack(next);
      setPlayingFromUserQueue(true);
      audio.src = convertFileSrc(next.path);
      audio.play().then(() => setIsPlaying(true)).catch(console.error);
      return;
    }

    setPlayingFromUserQueue(false);

    if (queue.length === 0) return;

    if (shuffle) {
      const remaining = queue.filter((_, i) => i !== queueIndex);
      if (remaining.length === 0) return;
      const pick = remaining[Math.floor(Math.random() * remaining.length)];
      const newIdx = queue.findIndex((t) => t.path === pick.path);
      setQueueIndex(newIdx);
      setCurrentTrack(pick);
      audio.src = convertFileSrc(pick.path);
      audio.play().then(() => setIsPlaying(true)).catch(console.error);
    } else if (queueIndex < queue.length - 1) {
      const next = queue[queueIndex + 1];
      setQueueIndex(queueIndex + 1);
      setCurrentTrack(next);
      audio.src = convertFileSrc(next.path);
      audio.play().then(() => setIsPlaying(true)).catch(console.error);
    } else if (repeat === "all") {
      const next = queue[0];
      setQueueIndex(0);
      setCurrentTrack(next);
      audio.src = convertFileSrc(next.path);
      audio.play().then(() => setIsPlaying(true)).catch(console.error);
    } else {
      setIsPlaying(false);
    }
  }

  function playPrev() {
    if (queue.length === 0) return;
    const audio = audioRef.current;
    if (!audio) return;

    if (prevButtonBehavior === "restart-first" && audio.currentTime > 6) {
      audio.currentTime = 0;
      if (audio.paused) audio.play().then(() => setIsPlaying(true)).catch(console.error);
      return;
    }

    if (queueIndex > 0) {
      const prev = queue[queueIndex - 1];
      setQueueIndex(queueIndex - 1);
      setCurrentTrack(prev);
      audio.src = convertFileSrc(prev.path);
      audio.play().then(() => setIsPlaying(true)).catch(console.error);
    } else if (repeat === "all") {
      const prev = queue[queue.length - 1];
      setQueueIndex(queue.length - 1);
      setCurrentTrack(prev);
      audio.src = convertFileSrc(prev.path);
      audio.play().then(() => setIsPlaying(true)).catch(console.error);
    }
  }

  function addToQueue(track: Track) {
    setUserQueue((prev) => [...prev, track]);
  }

  function playNextTrack(track: Track) {
    setUserQueue((prev) => [track, ...prev]);
  }

  function removeFromQueue(index: number) {
    setUserQueue((prev) => prev.filter((_, i) => i !== index));
  }

  function reorderQueue(fromIndex: number, toIndex: number) {
    setUserQueue((prev) => {
      const next = [...prev];
      const [moved] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, moved);
      return next;
    });
  }

  function clearQueue() {
    setUserQueue([]);
  }

  const handleTrackEnd = useCallback(() => {
    if (videoActiveRef.current) return;
    if (repeat === "one") {
      const audio = audioRef.current;
      if (audio) {
        audio.currentTime = 0;
        audio.play().then(() => setIsPlaying(true)).catch(console.error);
      }
    } else {
      playNext();
    }
  }, [queueIndex, queue, repeat, shuffle, userQueue]);

  async function handleCreatePlaylist(name: string) {
    try {
      const playlist = await invoke<Playlist>("create_playlist", { name });
      setPlaylists((prev) => [...prev, playlist]);
    } catch (e) {
      console.error(e);
    }
  }

  async function handleDeletePlaylist(id: string) {
    try {
      await invoke("delete_playlist", { id });
      const deletedPlaylist = playlists.find((p) => p.id === id);
      const updatedPlaylists = playlists.filter((p) => p.id !== id);
      setPlaylists(updatedPlaylists);
      if (currentView === id) setCurrentView("library");

      if (currentTrack && playSource === deletedPlaylist?.name) {
        if (playlistDeleteBehavior === "stop") {
          audioRef.current?.pause();
          setCurrentTrack(null);
          setIsPlaying(false);
          setQueue([]);
          setPlaySource(null);
        } else if (playlistDeleteBehavior === "find-playlist") {
          const alt = updatedPlaylists.find((p) =>
            p.tracks.some((t) => t.path === currentTrack.path)
          );
          if (alt) {
            setQueue(alt.tracks);
            const idx = alt.tracks.findIndex((t) => t.path === currentTrack.path);
            setQueueIndex(idx >= 0 ? idx : 0);
            setPlaySource(alt.name);
          } else {
            setQueue(tracks);
            const idx = tracks.findIndex((t) => t.path === currentTrack.path);
            setQueueIndex(idx >= 0 ? idx : 0);
            setPlaySource("Library");
          }
        } else {
          setQueue(tracks);
          const idx = tracks.findIndex((t) => t.path === currentTrack.path);
          setQueueIndex(idx >= 0 ? idx : 0);
          setPlaySource("Library");
        }
      }
    } catch (e) {
      console.error(e);
    }
  }

  async function handleUpdatePlaylist(
    id: string,
    name?: string,
    cover?: string,
  ) {
    try {
      const updated = await invoke<Playlist>("update_playlist", {
        id,
        name: name || null,
        cover: cover || null,
      });
      if (updated) {
        setPlaylists((prev) => prev.map((p) => (p.id === id ? updated : p)));
      }
    } catch (e) {
      console.error(e);
    }
  }

  async function handleAddToPlaylist(playlistId: string, track: Track) {
    try {
      const updated = await invoke<Playlist>("add_to_playlist", {
        id: playlistId,
        track,
      });
      if (updated) {
        setPlaylists((prev) =>
          prev.map((p) => (p.id === playlistId ? updated : p)),
        );
      }
    } catch (e) {
      console.error(e);
    }
  }

  async function handleRemoveFromPlaylist(
    playlistId: string,
    trackPath: string,
  ) {
    try {
      const updated = await invoke<Playlist>("remove_from_playlist", {
        id: playlistId,
        trackPath,
      });
      if (updated) {
        setPlaylists((prev) =>
          prev.map((p) => (p.id === playlistId ? updated : p)),
        );
      }
    } catch (e) {
      console.error(e);
    }
  }

  async function handleReorderPlaylistTrack(
    playlistId: string,
    fromIndex: number,
    toIndex: number,
  ) {
    try {
      const updated = await invoke<Playlist>("reorder_playlist_track", {
        id: playlistId,
        fromIndex,
        toIndex,
      });
      if (updated) {
        setPlaylists((prev) =>
          prev.map((p) => (p.id === playlistId ? updated : p)),
        );
      }
    } catch (e) {
      console.error(e);
    }
  }

  async function handlePickCover(playlistId: string) {
    const file = await open({
      filters: [{ name: "Images", extensions: ["png", "jpg", "jpeg", "webp"] }],
    });
    if (file) {
      const coverUrl = convertFileSrc(file as string);
      handleUpdatePlaylist(playlistId, undefined, coverUrl);
    }
  }

  async function handleEditTrackSave(
    trackPath: string,
    title: string,
    artist: string,
    album: string,
    coverPath: string | null,
  ) {
    try {
      const updated = await invoke<Track>("update_track_metadata", {
        trackPath,
        title,
        artist,
        album,
        coverPath,
      });
      setTracks((prev) =>
        prev.map((t) => (t.path === trackPath ? updated : t)),
      );
      setPlaylists((prev) =>
        prev.map((p) => ({
          ...p,
          tracks: p.tracks.map((t) => (t.path === trackPath ? updated : t)),
        })),
      );
      if (currentTrack?.path === trackPath) {
        setCurrentTrack(updated);
      }
    } catch (e) {
      console.error("Failed to update metadata:", e);
    }
  }

  async function handleDeleteTrack(trackPath: string) {
    try {
      await invoke("delete_track_file", { trackPath });
      setTracks((prev) => prev.filter((t) => t.path !== trackPath));
      setPlaylists((prev) =>
        prev.map((p) => ({
          ...p,
          tracks: p.tracks.filter((t) => t.path !== trackPath),
        })),
      );
      if (currentTrack?.path === trackPath) {
        setCurrentTrack(null);
        setIsPlaying(false);
        if (audioRef.current) audioRef.current.pause();
      }
    } catch (e) {
      console.error("Failed to delete track:", e);
    }
  }

  async function pickTrackCover(): Promise<string | null> {
    const file = await open({
      filters: [
        { name: "Images", extensions: ["png", "jpg", "jpeg", "webp"] },
      ],
    });
    return (file as string) || null;
  }

  async function handlePickLrc() {
    if (!currentTrack) return;
    await handleLinkLrcForTrack(currentTrack);
    setLyricsVisible(true);
  }

  async function handleLinkLrcForTrack(track: Track) {
    const file = await open({
      filters: [{ name: "LRC Files", extensions: ["lrc"] }],
    });
    if (file) {
      const lrcPath = file as string;
      await invoke("link_lrc", { trackPath: track.path, lrcPath });
      handleLrcLinked(track.path, lrcPath);
    }
  }

  async function handleUnlinkLrc() {
    if (!currentTrack) return;
    await invoke("unlink_lrc", { trackPath: currentTrack.path });
    handleLrcLinked(currentTrack.path, null);
    setLyricsVisible(false);
  }

  function handleLrcLinked(trackPath: string, lrcPath: string | null) {
    const updateLrc = (t: Track) =>
      t.path === trackPath ? { ...t, lrc_path: lrcPath } : t;
    setTracks((prev) => prev.map(updateLrc));
    setPlaylists((prev) =>
      prev.map((p) => ({ ...p, tracks: p.tracks.map(updateLrc) })),
    );
    if (currentTrack?.path === trackPath) {
      setCurrentTrack((prev) => prev ? { ...prev, lrc_path: lrcPath } : prev);
    }
  }

  async function handleLinkVideo(trackPath: string, videoPath: string) {
    try {
      await invoke("link_video", { trackPath, videoPath });
      await scanAllVideos(libraryPaths);
      if (currentTrack?.path === trackPath) {
        setCurrentTrackVideoPath(videoPath);
      }
    } catch (e) {
      console.error("Failed to link video:", e);
    }
  }

  async function handleUnlinkVideo(trackPath: string) {
    try {
      await invoke("unlink_video", { trackPath });
      await scanAllVideos(libraryPaths);
      if (currentTrack?.path === trackPath) {
        setCurrentTrackVideoPath(null);
      }
    } catch (e) {
      console.error("Failed to unlink video:", e);
    }
  }

  async function handleLinkVideoFile(track: Track) {
    const file = await open({
      filters: [{ name: "Videos", extensions: ["mp4", "mkv", "webm", "avi", "mov"] }],
    });
    if (file) {
      await handleLinkVideo(track.path, file as string);
    }
  }

  useEffect(() => {
    if (!currentTrack) {
      setCurrentTrackVideoPath(null);
      return;
    }
    invoke<string | null>("get_video_for_track", { trackPath: currentTrack.path })
      .then(setCurrentTrackVideoPath)
      .catch(() => setCurrentTrackVideoPath(null));
  }, [currentTrack]);

  const currentPlaylist =
    currentView !== "library"
      ? playlists.find((p) => p.id === currentView) || null
      : null;

  return (
    <div className="app">
      <Sidebar
        playlists={playlists}
        currentView={currentView}
        onViewChange={(view) => {
          setCurrentView(view);
          if (view === "library") setLibraryResetKey((k) => k + 1);
        }}
        onCreatePlaylist={handleCreatePlaylist}
        onDeletePlaylist={handleDeletePlaylist}
        updateAvailable={updateAvailable}
      />
      <main className="main-content">
        {currentView === "lrc-creator" ? (
          <LrcCreator tracks={tracks} onLrcLinked={handleLrcLinked} />
        ) : currentView === "settings" ? (
          <Settings
            accentColor={accentColor}
            theme={theme}
            libraryPaths={libraryPaths}
            tracks={tracks}
            onAccentChange={setAccentColor}
            onThemeChange={setTheme}
            onAddFolder={addFolder}
            onRemoveFolder={removeFolder}
            onRefreshLibrary={() => { scanAllPaths(libraryPaths); scanAllVideos(libraryPaths); }}
            onDeleteTrack={handleDeleteTrack}
            playlistDeleteBehavior={playlistDeleteBehavior}
            onPlaylistDeleteBehaviorChange={(b) => {
              setPlaylistDeleteBehavior(b);
              localStorage.setItem("playlistDeleteBehavior", b);
            }}
            lyricsCloseOnClickOutside={lyricsCloseOnClickOutside}
            onLyricsCloseOnClickOutsideChange={(v) => {
              setLyricsCloseOnClickOutside(v);
              localStorage.setItem("lyricsCloseOnClickOutside", String(v));
            }}
            libraryClickBehavior={libraryClickBehavior}
            onLibraryClickBehaviorChange={(b) => {
              setLibraryClickBehavior(b);
              localStorage.setItem("libraryClickBehavior", b);
            }}
            fullscreenLayout={fullscreenLayout}
            fullscreenBackground={fullscreenBackground}
            fullscreenControls={fullscreenControls}
            onFullscreenLayoutChange={(l) => {
              setFullscreenLayout(l);
              localStorage.setItem("fullscreenLayout", l);
            }}
            onFullscreenBackgroundChange={(b) => {
              setFullscreenBackground(b);
              localStorage.setItem("fullscreenBackground", b);
            }}
            onFullscreenControlsChange={(c) => {
              setFullscreenControls(c);
              localStorage.setItem("fullscreenControls", c);
            }}
            prevButtonBehavior={prevButtonBehavior}
            onPrevButtonBehaviorChange={(b) => {
              setPrevButtonBehavior(b);
              localStorage.setItem("prevButtonBehavior", b);
            }}
            updateAvailable={updateAvailable}
          />
        ) : (
          <TrackList
            tracks={tracks}
            playlist={currentPlaylist}
            currentTrack={currentTrack}
            isPlaying={isPlaying}
            playlists={playlists}
            onPlay={playTrack}
            onAddToPlaylist={handleAddToPlaylist}
            onRemoveFromPlaylist={handleRemoveFromPlaylist}
            onUpdatePlaylist={handleUpdatePlaylist}
            onPickCover={handlePickCover}
            onEditTrack={setEditingTrack}
            onLinkLrc={handleLinkLrcForTrack}
            onLinkVideo={handleLinkVideoFile}
            libraryClickBehavior={libraryClickBehavior}
            libraryResetKey={libraryResetKey}
            videos={videos}
            onPlayVideo={(path) => {
              setActiveVideo(path);
              setActiveVideoLinked(false);
              videoActiveRef.current = false;
            }}
            onLinkVideoToTrack={handleLinkVideo}
            onUnlinkVideo={handleUnlinkVideo}
            onReorderTrack={handleReorderPlaylistTrack}
            onPlayNext={playNextTrack}
            onAddToQueue={addToQueue}
          />
        )}
      </main>
      {editingTrack && (
        <EditTrackModal
          track={editingTrack}
          onSave={handleEditTrackSave}
          onPickCover={pickTrackCover}
          onClose={() => setEditingTrack(null)}
        />
      )}
      {lyricsVisible && currentTrack?.lrc_path && (
        <Lyrics
          lrcPath={currentTrack.lrc_path}
          trackPath={currentTrack.path}
          audioRef={audioRef}
          closeOnClickOutside={lyricsCloseOnClickOutside}
          onChangeLrc={handlePickLrc}
          onUnlinkLrc={handleUnlinkLrc}
          onClose={() => setLyricsVisible(false)}
        />
      )}
      <Player
        currentTrack={currentTrack}
        isPlaying={isPlaying}
        queue={queue}
        queueIndex={queueIndex}
        shuffle={shuffle}
        repeat={repeat}
        onPlayPause={togglePlayPause}
        onNext={playNext}
        onPrev={playPrev}
        onTrackEnd={handleTrackEnd}
        onShuffleToggle={() => setShuffle((s) => !s)}
        onRepeatCycle={() => setRepeat((r) => r === "off" ? "all" : r === "all" ? "one" : "off")}
        hasLrc={!!currentTrack?.lrc_path}
        lyricsVisible={lyricsVisible}
        onLyricsToggle={() => {
          if (currentTrack?.lrc_path) {
            setLyricsVisible((v) => !v);
          } else {
            handlePickLrc();
          }
        }}
        audioRef={audioRef}
        playSource={playSource}
        onCoverClick={() => {
          if (currentTrack) setFullscreenVisible(true);
        }}
        onAddToPlaylist={handleAddToPlaylist}
        onRemoveFromPlaylist={handleRemoveFromPlaylist}
        onEditTrack={setEditingTrack}
        onLinkLrc={handleLinkLrcForTrack}
        onLinkVideo={handleLinkVideoFile}
        playlists={playlists}
        playlist={currentPlaylist}
        currentTrackVideoPath={currentTrackVideoPath}
        onPlayVideo={(path) => {
          setActiveVideo(path);
          setActiveVideoLinked(true);
          videoActiveRef.current = true;
        }}
        userQueue={userQueue}
        playingFromUserQueue={playingFromUserQueue}
        onPlayNext={playNextTrack}
        onAddToQueue={addToQueue}
        onRemoveFromQueue={removeFromQueue}
        onReorderQueue={reorderQueue}
        onClearQueue={clearQueue}
      />
      {fullscreenVisible && currentTrack && (
        <FullscreenPlayer
          currentTrack={currentTrack}
          isPlaying={isPlaying}
          shuffle={shuffle}
          repeat={repeat}
          audioRef={audioRef}
          onPlayPause={togglePlayPause}
          onNext={playNext}
          onPrev={playPrev}
          onShuffleToggle={() => setShuffle((s) => !s)}
          onRepeatCycle={() => setRepeat((r) => r === "off" ? "all" : r === "all" ? "one" : "off")}
          onClose={() => setFullscreenVisible(false)}
        />
      )}
      {activeVideo && (
        <Suspense fallback={null}><VideoPlayer
          videoPath={activeVideo}
          onClose={() => {
            videoActiveRef.current = false;
            setActiveVideo(null);
            const audio = audioRef.current;
            if (audio) {
              if (audio.ended) {
                playNext();
              } else {
                setIsPlaying(!audio.paused);
              }
            }
          }}
          audioRef={activeVideoLinked ? audioRef : undefined}
          isAudioPlaying={activeVideoLinked ? isPlaying : undefined}
          onAudioPlayPause={activeVideoLinked ? togglePlayPause : undefined}
          lrcPath={activeVideoLinked ? currentTrack?.lrc_path : undefined}
          trackPath={activeVideoLinked ? currentTrack?.path : undefined}
          onVideoEnd={() => {
            videoActiveRef.current = false;
            setActiveVideo(null);
            playNext();
          }}
          onNext={() => {
            videoActiveRef.current = false;
            setActiveVideo(null);
            playNext();
          }}
          onPrev={() => {
            videoActiveRef.current = false;
            setActiveVideo(null);
            playPrev();
          }}
        /></Suspense>
      )}
    </div>
  );
}

export default App;
