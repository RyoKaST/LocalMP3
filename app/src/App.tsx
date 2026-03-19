import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";

import "./App.css";

interface Track {
  title: string;
  artist: string;
  album: string;
  duration: number;
  path: string;
}

function App() {
  const [tracks, setTracks] = useState<Track[]>([]);

  async function selectFolder() {
    const folder = await open({ directory: true });
    if (folder) {
      try {
        const result = await invoke<Track[]>("scan_library", { path: folder });
        setTracks(result);
        console.log(result);
      } catch (e) {
        console.error(e);
      }
    }
  }

  return (
    <div>
      <button onClick={selectFolder}>Choisir un dossier</button>
      <ul>
        {tracks.map((track) => (
          <li key={track.path}>
            {track.title} - {track.artist} - {track.album} - {track.duration}s
          </li>
        ))}
      </ul>
    </div>
  );
}

export default App;
