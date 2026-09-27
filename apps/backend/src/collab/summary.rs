use serde_json::Value;
use yrs::types::ToJson;
use yrs::updates::decoder::Decode;
use yrs::{Doc, Map, ReadTxn, StateVector, Transact, Update};

use crate::database::schemas::songs::SongSummary;
use crate::error::collab::CollabError;

/// The root map every client keeps the `TabSong` fields in.
pub const ROOT: &str = "song";

const MAX_TEXT: usize = 200;

pub fn summarize(state: &[u8]) -> Result<SongSummary, CollabError> {
    summary_of(&song_json(&load_doc(state)?))
}

pub fn retitle(state: &[u8], title: &str) -> Result<Vec<u8>, CollabError> {
    let doc = load_doc(state)?;
    let song = doc.get_or_insert_map(ROOT);
    let mut txn = doc.transact_mut();
    song.insert(&mut txn, "title", title);
    Ok(txn.encode_state_as_update_v1(&StateVector::default()))
}

pub fn load_doc(state: &[u8]) -> Result<Doc, CollabError> {
    let doc = Doc::new();
    doc.transact_mut().apply_update(Update::decode_v1(state)?)?;
    Ok(doc)
}

fn song_json(doc: &Doc) -> Value {
    let song = doc.get_or_insert_map(ROOT).to_json(&doc.transact());
    serde_json::to_value(song).unwrap_or_default()
}

fn summary_of(song: &Value) -> Result<SongSummary, CollabError> {
    let tracks = song["tracks"].as_array().ok_or(CollabError::InvalidSong)?;
    let bars = tracks
        .first()
        .and_then(|track| track["measures"].as_array());

    Ok(SongSummary {
        title: text(&song["title"]).unwrap_or_else(|| "Untitled".to_owned()),
        artist: text(&song["artist"]).unwrap_or_default(),
        // Yjs numbers may arrive as floats.
        bpm: song["bpm"].as_f64().map_or(120, |bpm| bpm.round() as i32),
        track_count: tracks.len() as i32,
        bar_count: bars.map_or(0, |bars| bars.len() as i32),
    })
}

fn text(value: &Value) -> Option<String> {
    let trimmed = value.as_str()?.trim();
    (!trimmed.is_empty()).then(|| trimmed.chars().take(MAX_TEXT).collect())
}
