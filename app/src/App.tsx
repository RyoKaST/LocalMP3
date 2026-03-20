import { useState, useEffect, useRef, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { convertFileSrc } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { TransitionEngine } from "./audio/TransitionEngine";
import Sidebar from "./components/Sidebar";
import TrackList from "./components/TrackList";
import Player from "./components/Player";
import EditTrackModal from "./components/EditTrackModal";
import Settings from "./components/Settings";
import LrcCreator from "./components/LrcCreator";
import Lyrics from "./components/Lyrics";
import { Track, Playlist } from "./types";
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
  const [accentColor, setAccentColor] = useState(() => localStorage.getItem("accentColor") || "#1db954");
  const [theme, setTheme] = useState<"dark" | "light">(() => (localStorage.getItem("theme") as "dark" | "light") || "dark");
  const [libraryPaths, setLibraryPaths] = useState<string[]>([]);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

  const engineRef = useRef<TransitionEngine | null>(null);
  const handleTrackEndRef = useRef<() => void>(() => {});
  const queueRef = useRef<Track[]>([]);
  const queueIndexRef = useRef(0);
  const playlistsRef = useRef<Playlist[]>([]);
  const repeatRef = useRef<"off" | "all" | "one">("off");

  useEffect(() => { queueRef.current = queue; }, [queue]);
  useEffect(() => { queueIndexRef.current = queueIndex; }, [queueIndex]);
  useEffect(() => { playlistsRef.current = playlists; }, [playlists]);
  useEffect(() => { repeatRef.current = repeat; }, [repeat]);

  useEffect(() => {
    const engine = new TransitionEngine({
      onTimeUpdate: (time, dur) => {
        setCurrentTime(time);
        setDuration(dur);

        // Auto-transition trigger for mix-enabled playlists
        const eng = engineRef.current;
        if (!eng || eng.isTransitioning()) return;

        const q = queueRef.current;
        const qi = queueIndexRef.current;
        const currentPlaylistMatch = playlistsRef.current.find((p) =>
          p.tracks.some((t) => t.path === q[qi]?.path)
        );
        const mix = currentPlaylistMatch?.mix;
        if (!mix?.enabled) return;

        let nextIdx = qi + 1;
        if (nextIdx >= q.length) {
          if (repeatRef.current === "all") {
            nextIdx = 0;
          } else {
            return;
          }
        }

        const nextTrack = q[nextIdx];
        const pairKey = `${q[qi].path}::${nextTrack.path}`;
        const preset = mix.pair_overrides[pairKey] ?? mix.default_transition;
        const transitionDur = preset.style === "cut" ? 0.05 : preset.duration;

        if (eng.shouldStartTransition(transitionDur)) {
          eng.scheduleTransition(nextTrack, preset);
        }
      },
      onTrackSwitch: (track) => {
        setCurrentTrack(track);
        const qi = queueIndexRef.current;
        const q = queueRef.current;
        const nextIdx = qi + 1 < q.length ? qi + 1 : 0;
        setQueueIndex(nextIdx);
      },
      onTransitionStart: () => {},
      onTransitionEnd: () => {},
      onEnded: () => {
        handleTrackEndRef.current();
      },
    });
    engineRef.current = engine;
    loadPlaylists();
    loadSavedLibrary();
    return () => {
      engine.destroy();
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
    // Generate a slightly lighter hover variant
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

  async function loadSavedLibrary() {
    try {
      const paths = await invoke<string[]>("get_library_paths");
      setLibraryPaths(paths);
      if (paths.length > 0) {
        await scanAllPaths(paths);
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
    } catch (e) {
      console.error("Remove folder error:", e);
    }
  }

  function playTrack(track: Track, trackQueue: Track[]) {
    const engine = engineRef.current;
    if (!engine) return;
    const idx = trackQueue.findIndex((t) => t.path === track.path);
    setQueue(trackQueue);
    setQueueIndex(idx >= 0 ? idx : 0);
    setCurrentTrack(track);
    engine.play(track).then(() => setIsPlaying(true)).catch(console.error);
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
    const engine = engineRef.current;
    if (!engine || !currentTrack) return;
    if (isPlaying) {
      engine.pause();
      setIsPlaying(false);
    } else {
      engine.resume();
      setIsPlaying(true);
    }
  }

  function playNext() {
    if (queue.length === 0) return;
    const engine = engineRef.current;
    if (!engine) return;

    if (shuffle) {
      const remaining = queue.filter((_, i) => i !== queueIndex);
      if (remaining.length === 0) return;
      const pick = remaining[Math.floor(Math.random() * remaining.length)];
      const newIdx = queue.findIndex((t) => t.path === pick.path);
      setQueueIndex(newIdx);
      setCurrentTrack(pick);
      engine.play(pick).then(() => setIsPlaying(true)).catch(console.error);
    } else if (queueIndex < queue.length - 1) {
      const next = queue[queueIndex + 1];
      setQueueIndex(queueIndex + 1);
      setCurrentTrack(next);
      engine.play(next).then(() => setIsPlaying(true)).catch(console.error);
    } else if (repeat === "all") {
      const next = queue[0];
      setQueueIndex(0);
      setCurrentTrack(next);
      engine.play(next).then(() => setIsPlaying(true)).catch(console.error);
    } else {
      setIsPlaying(false);
    }
  }

  function playPrev() {
    if (queue.length === 0) return;
    const engine = engineRef.current;
    if (!engine) return;

    if (queueIndex > 0) {
      const prev = queue[queueIndex - 1];
      setQueueIndex(queueIndex - 1);
      setCurrentTrack(prev);
      engine.play(prev).then(() => setIsPlaying(true)).catch(console.error);
    } else if (repeat === "all") {
      const prev = queue[queue.length - 1];
      setQueueIndex(queue.length - 1);
      setCurrentTrack(prev);
      engine.play(prev).then(() => setIsPlaying(true)).catch(console.error);
    }
  }

  const handleTrackEnd = useCallback(() => {
    if (repeat === "one") {
      const engine = engineRef.current;
      if (engine) {
        engine.seek(0);
        engine.resume();
        setIsPlaying(true);
      }
    } else {
      playNext();
    }
  }, [queueIndex, queue, repeat, shuffle]);

  useEffect(() => { handleTrackEndRef.current = handleTrackEnd; }, [handleTrackEnd]);

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
      setPlaylists((prev) => prev.filter((p) => p.id !== id));
      if (currentView === id) setCurrentView("library");
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
      // Update track in library
      setTracks((prev) =>
        prev.map((t) => (t.path === trackPath ? updated : t)),
      );
      // Update track in playlists
      setPlaylists((prev) =>
        prev.map((p) => ({
          ...p,
          tracks: p.tracks.map((t) => (t.path === trackPath ? updated : t)),
        })),
      );
      // Update current track if it's the one being edited
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
        engineRef.current?.pause();
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
    const file = await open({
      filters: [{ name: "LRC Files", extensions: ["lrc"] }],
    });
    if (file) {
      const lrcPath = file as string;
      await invoke("link_lrc", { trackPath: currentTrack.path, lrcPath });
      handleLrcLinked(currentTrack.path, lrcPath);
      setLyricsVisible(true);
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

  const getEngineCurrentTime = useCallback(() => {
    return engineRef.current?.getCurrentTime() ?? 0;
  }, []);

  const handleEngineSeek = useCallback((time: number) => {
    engineRef.current?.seek(time);
  }, []);

  const currentPlaylist =
    currentView !== "library"
      ? playlists.find((p) => p.id === currentView) || null
      : null;

  return (
    <div className="app">
      <Sidebar
        playlists={playlists}
        currentView={currentView}
        onViewChange={setCurrentView}
        onCreatePlaylist={handleCreatePlaylist}
        onDeletePlaylist={handleDeletePlaylist}
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
            onDeleteTrack={handleDeleteTrack}
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
            engine={engineRef.current}
            onMixSaved={(playlistId, mix) => {
              setPlaylists((prev) =>
                prev.map((p) => p.id === playlistId ? { ...p, mix } : p)
              );
            }}
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
          getCurrentTime={getEngineCurrentTime}
          onSeek={handleEngineSeek}
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
        currentTime={currentTime}
        duration={duration}
        onPlayPause={togglePlayPause}
        onNext={playNext}
        onPrev={playPrev}
        onShuffleToggle={() => setShuffle((s) => !s)}
        onRepeatCycle={() => setRepeat((r) => r === "off" ? "all" : r === "all" ? "one" : "off")}
        onSeek={(time) => engineRef.current?.seek(time)}
        onVolumeChange={(v) => engineRef.current?.setVolume(v)}
        hasLrc={!!currentTrack?.lrc_path}
        lyricsVisible={lyricsVisible}
        onLyricsToggle={() => {
          if (currentTrack?.lrc_path) {
            setLyricsVisible((v) => !v);
          } else {
            handlePickLrc();
          }
        }}
      />
    </div>
  );
}

export default App;
