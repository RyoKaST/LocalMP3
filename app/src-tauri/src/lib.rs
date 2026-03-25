use lofty::prelude::*;
use lofty::picture::Picture;
use serde::{Deserialize, Serialize};
use std::collections::hash_map::DefaultHasher;
use std::fs;
use std::hash::{Hash, Hasher};
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::Manager;
use walkdir::WalkDir;

#[derive(Serialize, Deserialize, Clone)]
pub struct Track {
    title: String,
    artist: String,
    album: String,
    duration: u64,
    path: String,
    cover: Option<String>,
    #[serde(default)]
    lrc_path: Option<String>,
    #[serde(default)]
    track_number: Option<u32>,
}

#[derive(Serialize, Deserialize, Clone)]
pub struct VideoFile {
    title: String,
    path: String,
    linked_track_path: Option<String>,
}

#[derive(Serialize, Deserialize, Clone)]
pub struct Playlist {
    id: String,
    name: String,
    cover: Option<String>,
    tracks: Vec<Track>,
}

#[derive(Serialize, Deserialize)]
struct AppData {
    playlists: Vec<Playlist>,
    #[serde(default)]
    library_paths: Vec<String>,
    #[serde(default)]
    library_path: Option<String>,
    /// audio path -> lrc path
    #[serde(default)]
    lrc_links: std::collections::HashMap<String, String>,
    /// audio path -> speed multiplier
    #[serde(default)]
    lrc_speeds: std::collections::HashMap<String, f64>,
    #[serde(default)]
    video_links: std::collections::HashMap<String, String>,
    /// video_path -> offset in seconds
    #[serde(default)]
    video_offsets: std::collections::HashMap<String, f64>,
    /// tracks marked as having no lyrics
    #[serde(default)]
    no_lyrics: Vec<String>,
    /// track_path -> EQ JSON string
    #[serde(default)]
    track_eq: std::collections::HashMap<String, String>,
}

impl Default for AppData {
    fn default() -> Self {
        AppData {
            playlists: vec![],
            library_paths: vec![],
            library_path: None,
            lrc_links: std::collections::HashMap::new(),
            lrc_speeds: std::collections::HashMap::new(),
            video_links: std::collections::HashMap::new(),
            video_offsets: std::collections::HashMap::new(),
            no_lyrics: vec![],
            track_eq: std::collections::HashMap::new(),
        }
    }
}

fn migrate_data(data: &mut AppData) -> bool {
    if let Some(path) = data.library_path.take() {
        if !data.library_paths.contains(&path) {
            data.library_paths.push(path);
        }
        true
    } else {
        false
    }
}

fn get_data_path(app: &tauri::AppHandle) -> PathBuf {
    let dir = app.path().app_data_dir().unwrap();
    fs::create_dir_all(&dir).ok();
    dir.join("data.json")
}

fn load_data(app: &tauri::AppHandle) -> AppData {
    let path = get_data_path(app);
    if path.exists() {
        let content = fs::read_to_string(&path).unwrap_or_default();
        let mut data: AppData = serde_json::from_str(&content).unwrap_or_default();
        if migrate_data(&mut data) {
            save_data_to_path(&path, &data);
        }
        data
    } else {
        AppData::default()
    }
}

fn save_data_to_path(path: &PathBuf, data: &AppData) {
    if let Ok(content) = serde_json::to_string_pretty(data) {
        fs::write(path, content).ok();
    }
}

fn save_data(app: &tauri::AppHandle, data: &AppData) {
    let path = get_data_path(app);
    save_data_to_path(&path, data);
}

fn extract_cover(tag: &lofty::tag::Tag, cache_dir: &std::path::Path) -> Option<String> {
    let pictures = tag.pictures();
    let pic = pictures.first()?;
    let data = pic.data();
    if data.is_empty() {
        return None;
    }

    let mut hasher = DefaultHasher::new();
    data.hash(&mut hasher);
    let hash = hasher.finish();

    let ext = match pic.mime_type() {
        Some(lofty::picture::MimeType::Png) => "png",
        Some(lofty::picture::MimeType::Bmp) => "bmp",
        Some(lofty::picture::MimeType::Gif) => "gif",
        Some(lofty::picture::MimeType::Tiff) => "tiff",
        _ => "jpg",
    };

    let cover_path = cache_dir.join(format!("{:x}.{}", hash, ext));

    if !cover_path.exists() {
        fs::write(&cover_path, data).ok()?;
    }

    Some(cover_path.to_string_lossy().to_string())
}

fn find_lrc_file(audio_path: &std::path::Path) -> Option<String> {
    let lrc_path = audio_path.with_extension("lrc");
    if lrc_path.exists() {
        Some(lrc_path.to_string_lossy().to_string())
    } else {
        None
    }
}

fn read_track_metadata(path: &std::path::Path, cover_cache: &std::path::Path) -> Option<Track> {
    let metadata = lofty::read_from_path(path).ok()?;
    let tag = metadata.primary_tag()?;
    let cover = extract_cover(tag, cover_cache);
    let lrc_path = find_lrc_file(path);
    Some(Track {
        title: tag
            .title()
            .map_or("Unknown".to_string(), |t| t.to_string()),
        artist: tag
            .artist()
            .map_or("Unknown".to_string(), |a| a.to_string()),
        album: tag
            .album()
            .map_or("Unknown".to_string(), |al| al.to_string()),
        duration: metadata.properties().duration().as_secs(),
        path: path.to_string_lossy().to_string(),
        cover,
        lrc_path,
        track_number: tag.track(),
    })
}

#[tauri::command]
fn scan_library(app: tauri::AppHandle, path: String) -> Vec<Track> {
    let cover_cache = app.path().app_data_dir().unwrap().join("covers");
    fs::create_dir_all(&cover_cache).ok();

    let data = load_data(&app);

    let mut tracks = Vec::new();
    for entry in WalkDir::new(&path) {
        let entry = match entry {
            Ok(entry) => entry,
            Err(_) => continue,
        };
        if let Some(ext) = entry.path().extension().and_then(|e| e.to_str()) {
            match ext.to_lowercase().as_str() {
                "mp3" | "flac" | "ogg" | "wav" | "m4a" | "aac" | "wma" => {
                    if let Some(mut track) = read_track_metadata(entry.path(), &cover_cache) {
                        if let Some(manual_lrc) = data.lrc_links.get(&track.path) {
                            if Path::new(manual_lrc).exists() {
                                track.lrc_path = Some(manual_lrc.clone());
                            }
                        }
                        tracks.push(track);
                    }
                }
                _ => {}
            }
        }
    }
    tracks.sort_by(|a, b| a.title.to_lowercase().cmp(&b.title.to_lowercase()));
    tracks
}

#[tauri::command]
fn get_library_paths(app: tauri::AppHandle) -> Vec<String> {
    load_data(&app).library_paths
}

#[tauri::command]
fn add_library_path(app: tauri::AppHandle, path: String) -> Vec<String> {
    let mut data = load_data(&app);
    if !data.library_paths.contains(&path) {
        data.library_paths.push(path);
    }
    save_data(&app, &data);
    data.library_paths
}

#[tauri::command]
fn remove_library_path(app: tauri::AppHandle, path: String) -> Vec<String> {
    let mut data = load_data(&app);
    data.library_paths.retain(|p| p != &path);
    save_data(&app, &data);
    data.library_paths
}

#[tauri::command]
fn get_playlists(app: tauri::AppHandle) -> Vec<Playlist> {
    load_data(&app).playlists
}

#[tauri::command]
fn create_playlist(app: tauri::AppHandle, name: String) -> Playlist {
    let mut data = load_data(&app);
    let id = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_millis()
        .to_string();
    let playlist = Playlist {
        id,
        name,
        cover: None,
        tracks: vec![],
    };
    data.playlists.push(playlist.clone());
    save_data(&app, &data);
    playlist
}

#[tauri::command]
fn update_playlist(
    app: tauri::AppHandle,
    id: String,
    name: Option<String>,
    cover: Option<String>,
) -> Option<Playlist> {
    let mut data = load_data(&app);
    if let Some(playlist) = data.playlists.iter_mut().find(|p| p.id == id) {
        if let Some(name) = name {
            playlist.name = name;
        }
        if let Some(cover) = cover {
            playlist.cover = Some(cover);
        }
        let updated = playlist.clone();
        save_data(&app, &data);
        Some(updated)
    } else {
        None
    }
}

#[tauri::command]
fn delete_playlist(app: tauri::AppHandle, id: String) {
    let mut data = load_data(&app);
    data.playlists.retain(|p| p.id != id);
    save_data(&app, &data);
}

#[tauri::command]
fn add_to_playlist(app: tauri::AppHandle, id: String, track: Track) -> Option<Playlist> {
    let mut data = load_data(&app);
    if let Some(playlist) = data.playlists.iter_mut().find(|p| p.id == id) {
        if !playlist.tracks.iter().any(|t| t.path == track.path) {
            playlist.tracks.push(track);
        }
        let updated = playlist.clone();
        save_data(&app, &data);
        Some(updated)
    } else {
        None
    }
}

#[tauri::command]
fn remove_from_playlist(
    app: tauri::AppHandle,
    id: String,
    track_path: String,
) -> Option<Playlist> {
    let mut data = load_data(&app);
    if let Some(playlist) = data.playlists.iter_mut().find(|p| p.id == id) {
        playlist.tracks.retain(|t| t.path != track_path);
        let updated = playlist.clone();
        save_data(&app, &data);
        Some(updated)
    } else {
        None
    }
}

#[tauri::command]
fn reorder_playlist_track(
    app: tauri::AppHandle,
    id: String,
    from_index: usize,
    to_index: usize,
) -> Option<Playlist> {
    let mut data = load_data(&app);
    if let Some(playlist) = data.playlists.iter_mut().find(|p| p.id == id) {
        let len = playlist.tracks.len();
        if from_index >= len || to_index >= len || from_index == to_index {
            return Some(playlist.clone());
        }
        let track = playlist.tracks.remove(from_index);
        playlist.tracks.insert(to_index, track);
        let updated = playlist.clone();
        save_data(&app, &data);
        Some(updated)
    } else {
        None
    }
}

#[tauri::command]
fn update_track_metadata(
    app: tauri::AppHandle,
    track_path: String,
    title: Option<String>,
    artist: Option<String>,
    album: Option<String>,
    cover_path: Option<String>,
) -> Result<Track, String> {
    let path = Path::new(&track_path);
    let mut tagged_file = lofty::read_from_path(path).map_err(|e| e.to_string())?;

    let tag = tagged_file
        .primary_tag_mut()
        .ok_or("No tag found in file")?;

    if let Some(ref title) = title {
        tag.set_title(title.clone());
    }
    if let Some(ref artist) = artist {
        tag.set_artist(artist.clone());
    }
    if let Some(ref album) = album {
        tag.set_album(album.clone());
    }
    if let Some(ref cover) = cover_path {
        let img_data = fs::read(cover).map_err(|e| e.to_string())?;
        let mime = if cover.ends_with(".png") {
            lofty::picture::MimeType::Png
        } else {
            lofty::picture::MimeType::Jpeg
        };
        let pic = Picture::unchecked(img_data)
            .pic_type(lofty::picture::PictureType::CoverFront)
            .mime_type(mime)
            .build();
        tag.remove_picture_type(lofty::picture::PictureType::CoverFront);
        tag.push_picture(pic);
    }

    tag.save_to_path(path, lofty::config::WriteOptions::default())
        .map_err(|e| e.to_string())?;

    let cover_cache = app.path().app_data_dir().unwrap().join("covers");
    fs::create_dir_all(&cover_cache).ok();
    read_track_metadata(path, &cover_cache).ok_or("Failed to re-read metadata".to_string())
}

#[derive(Serialize, Deserialize, Clone)]
pub struct LrcLine {
    time: f64,
    text: String,
}

#[tauri::command]
fn read_lrc(lrc_path: String) -> Result<Vec<LrcLine>, String> {
    let content = fs::read_to_string(&lrc_path).map_err(|e| e.to_string())?;
    let mut lines = Vec::new();
    for line in content.lines() {
        let line = line.trim();
        if !line.starts_with('[') {
            continue;
        }
        if let Some(bracket_end) = line.find(']') {
            let tag = &line[1..bracket_end];
            let text = line[bracket_end + 1..].trim().to_string();
            if tag.chars().next().map_or(true, |c| !c.is_ascii_digit()) {
                continue;
            }
            if let Some(time) = parse_lrc_time(tag) {
                if !text.is_empty() {
                    lines.push(LrcLine { time, text });
                }
            }
        }
    }
    lines.sort_by(|a, b| a.time.partial_cmp(&b.time).unwrap_or(std::cmp::Ordering::Equal));
    Ok(lines)
}

fn parse_lrc_time(tag: &str) -> Option<f64> {
    let parts: Vec<&str> = tag.split(':').collect();
    if parts.len() != 2 {
        return None;
    }
    let minutes: f64 = parts[0].parse().ok()?;
    let seconds: f64 = parts[1].parse().ok()?;
    Some(minutes * 60.0 + seconds)
}

#[tauri::command]
fn link_lrc(app: tauri::AppHandle, track_path: String, lrc_path: String) -> Result<(), String> {
    if !Path::new(&lrc_path).exists() {
        return Err("LRC file does not exist".to_string());
    }
    let mut data = load_data(&app);
    data.lrc_links.insert(track_path, lrc_path);
    save_data(&app, &data);
    Ok(())
}

#[tauri::command]
fn unlink_lrc(app: tauri::AppHandle, track_path: String) {
    let mut data = load_data(&app);
    data.lrc_links.remove(&track_path);
    save_data(&app, &data);
}

#[derive(Serialize, Deserialize, Clone)]
pub struct LrcSearchResult {
    id: i64,
    #[serde(rename = "trackName")]
    track_name: String,
    #[serde(rename = "artistName")]
    artist_name: String,
    #[serde(rename = "albumName")]
    album_name: String,
    duration: f64,
    #[serde(rename = "syncedLyrics")]
    synced_lyrics: Option<String>,
    #[serde(rename = "plainLyrics")]
    plain_lyrics: Option<String>,
}

#[tauri::command]
async fn search_lrc_online(
    track_name: String,
    artist_name: String,
    duration: u64,
) -> Result<Option<String>, String> {
    let client = reqwest::Client::new();

    let get_url = format!(
        "https://lrclib.net/api/get?artist_name={}&track_name={}&duration={}",
        urlencod(&artist_name),
        urlencod(&track_name),
        duration,
    );
    if let Ok(resp) = client
        .get(&get_url)
        .header("User-Agent", "LocalMP3 v0.1.0")
        .send()
        .await
    {
        if resp.status().is_success() {
            if let Ok(result) = resp.json::<LrcSearchResult>().await {
                if let Some(synced) = result.synced_lyrics {
                    return Ok(Some(synced));
                }
                if let Some(plain) = result.plain_lyrics {
                    return Ok(Some(plain));
                }
            }
        }
    }

    let search_url = format!(
        "https://lrclib.net/api/search?q={}",
        urlencod(&format!("{} {}", track_name, artist_name)),
    );
    let resp = client
        .get(&search_url)
        .header("User-Agent", "LocalMP3 v0.1.0")
        .send()
        .await
        .map_err(|e| e.to_string())?;

    let results: Vec<LrcSearchResult> = resp.json().await.map_err(|e| e.to_string())?;

    for r in &results {
        if r.synced_lyrics.is_some() {
            return Ok(r.synced_lyrics.clone());
        }
    }
    for r in &results {
        if r.plain_lyrics.is_some() {
            return Ok(r.plain_lyrics.clone());
        }
    }

    Ok(None)
}

fn urlencod(s: &str) -> String {
    s.chars()
        .map(|c| match c {
            ' ' => "+".to_string(),
            c if c.is_alphanumeric() || "-_.~".contains(c) => c.to_string(),
            c => format!("%{:02X}", c as u32),
        })
        .collect()
}

#[tauri::command]
fn set_lrc_speed(app: tauri::AppHandle, track_path: String, speed: f64) {
    let mut data = load_data(&app);
    if (speed - 1.0).abs() < 0.001 {
        data.lrc_speeds.remove(&track_path);
    } else {
        data.lrc_speeds.insert(track_path, speed);
    }
    save_data(&app, &data);
}

#[tauri::command]
fn get_lrc_speed(app: tauri::AppHandle, track_path: String) -> f64 {
    let data = load_data(&app);
    data.lrc_speeds.get(&track_path).copied().unwrap_or(1.0)
}

#[tauri::command]
fn get_no_lyrics(app: tauri::AppHandle) -> Vec<String> {
    load_data(&app).no_lyrics
}

#[tauri::command]
fn set_no_lyrics(app: tauri::AppHandle, track_path: String, value: bool) {
    let mut data = load_data(&app);
    if value {
        if !data.no_lyrics.contains(&track_path) {
            data.no_lyrics.push(track_path);
        }
    } else {
        data.no_lyrics.retain(|p| p != &track_path);
    }
    save_data(&app, &data);
}

#[tauri::command]
fn save_lrc_file(path: String, content: String) -> Result<(), String> {
    fs::write(&path, content).map_err(|e| e.to_string())
}

#[tauri::command]
fn delete_track_file(track_path: String) -> Result<(), String> {
    let path = Path::new(&track_path);
    if !path.exists() {
        return Err("File does not exist".to_string());
    }
    fs::remove_file(path).map_err(|e| e.to_string())
}

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
    let mut data = load_data(&app);
    if let Some(video_path) = data.video_links.get(&track_path).cloned() {
        if Path::new(&video_path).exists() {
            return Some(video_path);
        }
        data.video_links.remove(&track_path);
        save_data(&app, &data);
    }
    None
}

#[tauri::command]
fn set_video_offset(app: tauri::AppHandle, video_path: String, offset: f64) {
    let mut data = load_data(&app);
    if offset.abs() < 0.001 {
        data.video_offsets.remove(&video_path);
    } else {
        data.video_offsets.insert(video_path, offset);
    }
    save_data(&app, &data);
}

#[tauri::command]
fn get_video_offset(app: tauri::AppHandle, video_path: String) -> f64 {
    let data = load_data(&app);
    data.video_offsets.get(&video_path).copied().unwrap_or(0.0)
}

#[tauri::command]
fn get_converted_video(app: tauri::AppHandle, video_path: String) -> Option<String> {
    let ext = Path::new(&video_path)
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_lowercase();
    if ext == "mp4" || ext == "mov" {
        return None;
    }
    let converted_path = get_converted_path(&app, &video_path);
    if converted_path.exists() {
        Some(converted_path.to_string_lossy().to_string())
    } else {
        None
    }
}

async fn run_ffmpeg(app: &tauri::AppHandle, args: &[&str]) -> Result<(bool, Vec<u8>, Vec<u8>), String> {
    use tauri_plugin_shell::ShellExt;
    let output = app.shell()
        .sidecar("ffmpeg")
        .map_err(|e| e.to_string())?
        .args(args)
        .output()
        .await
        .map_err(|e| format!("ffmpeg failed: {}", e))?;
    Ok((output.status.success(), output.stdout, output.stderr))
}

#[tauri::command]
async fn convert_video(app: tauri::AppHandle, video_path: String) -> Result<String, String> {
    let ext = Path::new(&video_path)
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_lowercase();
    if ext == "mp4" || ext == "mov" {
        return Ok(video_path);
    }

    let converted_path = get_converted_path(&app, &video_path);
    if converted_path.exists() {
        return Ok(converted_path.to_string_lossy().to_string());
    }

    if let Some(parent) = converted_path.parent() {
        fs::create_dir_all(parent).ok();
    }

    let tmp_path = converted_path.with_extension("tmp.mp4");
    let tmp_str = tmp_path.to_string_lossy().to_string();

    let result = run_ffmpeg(&app, &[
        "-i", &video_path,
        "-c:v", "copy",
        "-c:a", "copy",
        "-movflags", "+faststart",
        "-y",
        &tmp_str,
    ]).await;

    let success = matches!(&result, Ok((true, _, _)));

    if success && tmp_path.exists() {
        fs::rename(&tmp_path, &converted_path)
            .map_err(|e| format!("Failed to rename converted file: {}", e))?;
        return Ok(converted_path.to_string_lossy().to_string());
    }

    let _ = fs::remove_file(&tmp_path);
    let (ok, _, stderr) = run_ffmpeg(&app, &[
        "-i", &video_path,
        "-c:v", "libx264",
        "-crf", "0",
        "-preset", "fast",
        "-c:a", "aac",
        "-b:a", "320k",
        "-movflags", "+faststart",
        "-y",
        &tmp_str,
    ]).await?;

    if !ok {
        let _ = fs::remove_file(&tmp_path);
        return Err(format!("ffmpeg conversion failed: {}", String::from_utf8_lossy(&stderr)));
    }

    fs::rename(&tmp_path, &converted_path)
        .map_err(|e| format!("Failed to rename converted file: {}", e))?;
    Ok(converted_path.to_string_lossy().to_string())
}

#[tauri::command]
fn read_audio_file(path: String) -> Result<tauri::ipc::Response, String> {
    let bytes = fs::read(&path).map_err(|e| format!("Failed to read {}: {}", path, e))?;
    Ok(tauri::ipc::Response::new(bytes))
}

#[tauri::command]
fn get_track_eq(app: tauri::AppHandle, track_path: String) -> Option<String> {
    let data = load_data(&app);
    data.track_eq.get(&track_path).cloned()
}

#[tauri::command]
fn set_track_eq(app: tauri::AppHandle, track_path: String, eq: String) {
    let mut data = load_data(&app);
    data.track_eq.insert(track_path, eq);
    save_data(&app, &data);
}

#[derive(Deserialize)]
struct GithubAsset {
    name: String,
    browser_download_url: String,
}

#[derive(Deserialize)]
struct GithubReleaseApi {
    assets: Vec<GithubAsset>,
}

#[tauri::command]
async fn install_version(app: tauri::AppHandle, tag: String) -> Result<String, String> {
    let url = format!(
        "https://api.github.com/repos/RyoKaST/LocalMP3/releases/tags/{}",
        tag
    );

    let client = reqwest::Client::new();
    let release: GithubReleaseApi = client
        .get(&url)
        .header("User-Agent", "LocalMP3")
        .send()
        .await
        .map_err(|e| format!("Failed to fetch release: {}", e))?
        .json()
        .await
        .map_err(|e| format!("Failed to parse release: {}", e))?;

    let arch = std::env::consts::ARCH;
    let os = std::env::consts::OS;

    let suffix = match (os, arch) {
        ("macos", "aarch64") => "_aarch64.dmg",
        ("macos", "x86_64") => "_x64.dmg",
        ("windows", _) => "_x64-setup.exe",
        ("linux", _) => "_amd64.AppImage",
        _ => return Err(format!("Unsupported platform: {} {}", os, arch)),
    };

    let asset = release
        .assets
        .iter()
        .find(|a| a.name.ends_with(suffix))
        .ok_or_else(|| format!("No asset found for {}", suffix))?;

    let tmp_dir = app.path().app_data_dir().unwrap().join("version_switch");
    let _ = fs::create_dir_all(&tmp_dir);
    let download_path = tmp_dir.join(&asset.name);

    let response = client
        .get(&asset.browser_download_url)
        .header("User-Agent", "LocalMP3")
        .send()
        .await
        .map_err(|e| format!("Download failed: {}", e))?;

    let bytes = response
        .bytes()
        .await
        .map_err(|e| format!("Failed to read download: {}", e))?;

    fs::write(&download_path, &bytes)
        .map_err(|e| format!("Failed to save file: {}", e))?;

    if os == "macos" {
        install_macos_dmg(&download_path).await?;
    } else {
        // On Windows/Linux, open the folder containing the installer
        if let Some(parent) = download_path.parent() {
            let _ = std::process::Command::new(if os == "windows" { "explorer" } else { "xdg-open" })
                .arg(parent)
                .spawn();
        }
        return Ok("Installer downloaded. Please run it to complete the installation.".into());
    }

    // Clean up
    let _ = fs::remove_dir_all(&tmp_dir);

    Ok("Installation complete. Relaunching...".into())
}

async fn install_macos_dmg(dmg_path: &Path) -> Result<(), String> {
    use std::process::Command;

    // Mount the DMG
    let mount_output = Command::new("hdiutil")
        .args(["attach", "-nobrowse"])
        .arg(dmg_path)
        .output()
        .map_err(|e| format!("Failed to mount DMG: {}", e))?;

    if !mount_output.status.success() {
        return Err(format!(
            "hdiutil attach failed: {}",
            String::from_utf8_lossy(&mount_output.stderr)
        ));
    }

    let stdout = String::from_utf8_lossy(&mount_output.stdout);
    let mount_point = stdout
        .lines()
        .filter_map(|line| {
            line.find("/Volumes/").map(|i| line[i..].trim().to_string())
        })
        .last()
        .ok_or_else(|| format!("Could not find mount point in: {}", stdout))?;

    // Find the .app in the mounted DMG
    let app_name = fs::read_dir(&mount_point)
        .map_err(|e| format!("Failed to read mount: {}", e))?
        .filter_map(|e| e.ok())
        .find(|e| e.path().extension().map_or(false, |ext| ext == "app"))
        .map(|e| e.file_name().to_string_lossy().to_string())
        .ok_or("No .app found in DMG")?;

    let src = Path::new(&mount_point).join(&app_name);
    let dest = Path::new("/Applications").join(&app_name);

    // Remove old app if exists
    if dest.exists() {
        let _ = fs::remove_dir_all(&dest);
    }

    // Copy new app
    let cp = Command::new("cp")
        .args(["-R"])
        .arg(&src)
        .arg(&dest)
        .output()
        .map_err(|e| format!("Failed to copy app: {}", e))?;

    if !cp.status.success() {
        let _ = Command::new("hdiutil")
            .args(["detach", "-quiet"])
            .arg(&mount_point)
            .output();
        return Err(format!(
            "cp failed: {}",
            String::from_utf8_lossy(&cp.stderr)
        ));
    }

    // Strip quarantine
    let _ = Command::new("xattr")
        .args(["-cr"])
        .arg(&dest)
        .output();

    // Unmount DMG
    let _ = Command::new("hdiutil")
        .args(["detach", "-quiet"])
        .arg(&mount_point)
        .output();

    Ok(())
}

fn get_converted_path(app: &tauri::AppHandle, video_path: &str) -> PathBuf {
    let mut hasher = DefaultHasher::new();
    video_path.hash(&mut hasher);
    let hash = hasher.finish();
    let stem = Path::new(video_path)
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("video");
    let dir = app.path().app_data_dir().unwrap().join("converted_videos");
    dir.join(format!("{}_{:x}.mp4", stem, hash))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .invoke_handler(tauri::generate_handler![
            scan_library,
            get_library_paths,
            add_library_path,
            remove_library_path,
            get_playlists,
            create_playlist,
            update_playlist,
            delete_playlist,
            add_to_playlist,
            remove_from_playlist,
            reorder_playlist_track,
            update_track_metadata,
            delete_track_file,
            read_lrc,
            link_lrc,
            unlink_lrc,
            save_lrc_file,
            search_lrc_online,
            get_no_lyrics,
            set_no_lyrics,
            set_lrc_speed,
            get_lrc_speed,
            scan_videos,
            link_video,
            unlink_video,
            get_video_for_track,
            set_video_offset,
            get_video_offset,
            get_converted_video,
            convert_video,
            install_version,
            read_audio_file,
            get_track_eq,
            set_track_eq,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
