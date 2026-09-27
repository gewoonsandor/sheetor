//! Ownership, sharing and moves across two users' libraries. See `common` for the database gate.

mod common;

use common::{pool, song_state, user};
use sheetor_backend::collab::summary::summarize;
use sheetor_backend::database::schemas::roles::Role;
use sheetor_backend::error::library::LibraryError;
use sheetor_backend::services::{folder_service, library_service, share_service, song_service};
use sheetor_backend::state::{AppState, AuthSettings};

async fn state() -> Option<AppState> {
    let pool = pool().await?;
    Some(AppState::new(
        pool,
        "http://localhost:4000".to_owned(),
        AuthSettings::local_only(),
    ))
}

#[tokio::test]
async fn a_share_reveals_the_folder_and_everything_below_it() {
    let Some(state) = state().await else {
        eprintln!("skipped: TEST_DATABASE_URL unset");
        return;
    };
    let db = &state.db;
    let (ada, ben) = (user(db).await, user(db).await);
    let band = folder_service::create(db, ada.id, "Band", None)
        .await
        .unwrap();
    let demos = folder_service::create(db, ada.id, "Demos", Some(band.id))
        .await
        .unwrap();
    let takes = folder_service::create(db, ada.id, "Takes", Some(demos.id))
        .await
        .unwrap();
    let song = song_service::create(db, ada.id, Some(takes.id), &song_state("Riff"))
        .await
        .unwrap();

    let before = library_service::list(db, ben.id).await.unwrap();
    assert!(before.folders.is_empty() && before.songs.is_empty());

    share_service::grant(&state, ada.id, demos.id, &ben.email, Role::Viewer)
        .await
        .unwrap();
    let after = library_service::list(db, ben.id).await.unwrap();

    let seen: Vec<_> = after
        .folders
        .iter()
        .map(|f| (f.id, f.parent_id, f.role))
        .collect();
    assert_eq!(seen.len(), 2, "Band stays hidden: {seen:?}");
    assert!(
        seen.contains(&(demos.id, None, Role::Viewer)),
        "the share root has no visible parent"
    );
    assert!(seen.contains(&(takes.id, Some(demos.id), Role::Viewer)));
    let songs: Vec<_> = after.songs.iter().map(|s| (s.id, s.role)).collect();
    assert_eq!(songs, vec![(song.id, Role::Viewer)]);
}

#[tokio::test]
async fn only_an_editor_creates_inside_a_share_and_the_owner_keeps_it() {
    let Some(state) = state().await else {
        eprintln!("skipped: TEST_DATABASE_URL unset");
        return;
    };
    let db = &state.db;
    let (ada, ben) = (user(db).await, user(db).await);
    let band = folder_service::create(db, ada.id, "Band", None)
        .await
        .unwrap();
    share_service::grant(&state, ada.id, band.id, &ben.email, Role::Viewer)
        .await
        .unwrap();

    let refused = song_service::create(db, ben.id, Some(band.id), &song_state("A")).await;
    assert!(
        matches!(refused, Err(LibraryError::Forbidden)),
        "{refused:?}"
    );

    share_service::grant(&state, ada.id, band.id, &ben.email, Role::Editor)
        .await
        .unwrap();
    let song = song_service::create(db, ben.id, Some(band.id), &song_state("A"))
        .await
        .unwrap();
    assert_eq!(song.owner_id, ada.id);
    assert_eq!(song.role, Role::Editor);
}

#[tokio::test]
async fn moves_stay_inside_one_owner_and_never_loop() {
    let Some(state) = state().await else {
        eprintln!("skipped: TEST_DATABASE_URL unset");
        return;
    };
    let db = &state.db;
    let (ada, ben) = (user(db).await, user(db).await);
    let band = folder_service::create(db, ada.id, "Band", None)
        .await
        .unwrap();
    let demos = folder_service::create(db, ada.id, "Demos", Some(band.id))
        .await
        .unwrap();
    share_service::grant(&state, ada.id, band.id, &ben.email, Role::Editor)
        .await
        .unwrap();
    let song = song_service::create(db, ben.id, Some(band.id), &song_state("A"))
        .await
        .unwrap();

    let stolen = song_service::move_to(&state, ben.id, song.id, None).await;
    assert!(
        matches!(stolen, Err(LibraryError::CrossOwner)),
        "{stolen:?}"
    );

    for parent in [demos.id, band.id] {
        let looped = folder_service::move_to(&state, ada.id, band.id, Some(parent)).await;
        assert!(matches!(looped, Err(LibraryError::Cycle)), "{looped:?}");
    }
}

#[tokio::test]
async fn deleting_a_folder_hands_its_contents_to_the_parent() {
    let Some(state) = state().await else {
        eprintln!("skipped: TEST_DATABASE_URL unset");
        return;
    };
    let db = &state.db;
    let ada = user(db).await;
    let band = folder_service::create(db, ada.id, "Band", None)
        .await
        .unwrap();
    let demos = folder_service::create(db, ada.id, "Demos", Some(band.id))
        .await
        .unwrap();
    let takes = folder_service::create(db, ada.id, "Takes", Some(demos.id))
        .await
        .unwrap();
    let song = song_service::create(db, ada.id, Some(demos.id), &song_state("A"))
        .await
        .unwrap();

    folder_service::delete(&state, ada.id, demos.id)
        .await
        .unwrap();

    let library = library_service::list(db, ada.id).await.unwrap();
    let takes = library.folders.iter().find(|f| f.id == takes.id).unwrap();
    assert_eq!(takes.parent_id, Some(band.id));
    assert_eq!(library.songs.len(), 1);
    assert_eq!(library.songs[0].id, song.id);
    assert_eq!(library.songs[0].folder_id, Some(band.id));
}

#[tokio::test]
async fn a_collaborator_can_leave_but_not_manage_shares() {
    let Some(state) = state().await else {
        eprintln!("skipped: TEST_DATABASE_URL unset");
        return;
    };
    let db = &state.db;
    let (ada, ben) = (user(db).await, user(db).await);
    let band = folder_service::create(db, ada.id, "Band", None)
        .await
        .unwrap();
    share_service::grant(&state, ada.id, band.id, &ben.email, Role::Editor)
        .await
        .unwrap();

    let listed = share_service::list(db, ben.id, band.id).await;
    assert!(matches!(listed, Err(LibraryError::Forbidden)), "{listed:?}");

    share_service::revoke(&state, ben.id, band.id, ben.id)
        .await
        .unwrap();
    let gone = folder_service::rename(db, ben.id, band.id, "Mine").await;
    assert!(matches!(gone, Err(LibraryError::NotFound)), "{gone:?}");
}

#[test]
fn summarizes_a_song_document_and_rejects_garbage() {
    let summary = summarize(&song_state("Riff")).unwrap();
    assert_eq!(summary.title, "Riff");
    assert_eq!(summary.bpm, 120);
    assert_eq!((summary.track_count, summary.bar_count), (1, 0));

    assert!(summarize(b"not a yjs update").is_err());
}
