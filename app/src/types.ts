export interface Track {
  title: string;
  artist: string;
  album: string;
  duration: number;
  path: string;
  cover: string | null;
  lrc_path: string | null;
}

export interface LrcLine {
  time: number;
  text: string;
}

export interface Playlist {
  id: string;
  name: string;
  cover: string | null;
  tracks: Track[];
}
