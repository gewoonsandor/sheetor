use yrs::updates::decoder::Decode;
use yrs::{Any, Array, Doc, Map, Number, Out, ReadTxn, StateVector, Transact, Update};

use crate::database::schemas::songs::SongSummary;
use crate::error::collab::CollabError;

/// The root map every client keeps the `TabSong` fields in.
pub const ROOT: &str = "song";

const MAX_TEXT: usize = 200;

/// Reads only the fields the library lists, never the whole tree: a client controls how deeply
/// the document nests, and a recursive walk (`to_json`) of a deep one overflows the stack.
pub fn summarize(state: &[u8]) -> Result<SongSummary, CollabError> {
    let doc = load_doc(state)?;
    let song = doc.get_or_insert_map(ROOT);
    let txn = doc.transact();
    let tracks = song.get(&txn, "tracks").ok_or(CollabError::InvalidSong)?;
    let track_count = length(&txn, &tracks).ok_or(CollabError::InvalidSong)?;
    let bar_count = match &tracks {
        Out::YArray(tracks) => match tracks.get(&txn, 0) {
            Some(Out::YMap(track)) => track
                .get(&txn, "measures")
                .and_then(|bars| length(&txn, &bars)),
            _ => None,
        },
        _ => None,
    };

    Ok(SongSummary {
        title: text(song.get(&txn, "title")).unwrap_or_else(|| "Untitled".to_owned()),
        artist: text(song.get(&txn, "artist")).unwrap_or_default(),
        // Yjs numbers may arrive as floats.
        bpm: match song.get(&txn, "bpm") {
            Some(Out::Any(Any::Number(Number::Int(bpm)))) => bpm as i32,
            Some(Out::Any(Any::Number(Number::Float(bpm)))) => bpm.round() as i32,
            _ => 120,
        },
        track_count: track_count as i32,
        bar_count: bar_count.unwrap_or(0) as i32,
    })
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

/// How many items a shared array or a plain array value holds.
fn length<T: ReadTxn>(txn: &T, value: &Out) -> Option<u32> {
    match value {
        Out::YArray(array) => Some(array.len(txn)),
        Out::Any(Any::Array(items)) => Some(items.len() as u32),
        _ => None,
    }
}

fn text(value: Option<Out>) -> Option<String> {
    let Some(Out::Any(Any::String(value))) = value else {
        return None;
    };
    let trimmed = value.trim();
    (!trimmed.is_empty()).then(|| trimmed.chars().take(MAX_TEXT).collect())
}
