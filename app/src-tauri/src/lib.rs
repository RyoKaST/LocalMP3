use lofty::prelude::*;
use serde::Serialize;
use walkdir::WalkDir;

#[tauri::command]
fn scan_library(path: String) -> Vec<Track> {
    let mut tracks = Vec::<Track>::new();
    for entry in WalkDir::new(&path) {
        let entry = match entry {
            Ok(entry) => entry,
            Err(_) => continue,
        };
        if let Some(ext) = entry.path().extension() {
            if ext == "mp3" || ext == "flac" || ext == "ogg" || ext == "wav" {
                if let Ok(metadata) = lofty::read_from_path(entry.path()) {
                    if let Some(tag) = metadata.primary_tag() {
                        let track = Track {
                            title: tag.title().map_or("Unknown".to_string(), |t| t.to_string()),
                            artist: tag
                                .artist()
                                .map_or("Unknown".to_string(), |a| a.to_string()),
                            album: tag
                                .album()
                                .map_or("Unknown".to_string(), |al| al.to_string()),
                            duration: metadata.properties().duration().as_secs(),
                            path: entry.path().to_string_lossy().to_string(),
                        };
                        tracks.push(track);
                    }
                }
            }
        }
    }
    tracks
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![scan_library])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[derive(Serialize)]
struct Track {
    title: String,
    artist: String,
    album: String,
    duration: u64,
    path: String,
}
