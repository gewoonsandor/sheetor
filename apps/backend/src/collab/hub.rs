use uuid::Uuid;

#[derive(Clone, Default)]
pub struct Hub {}

impl Hub {
    pub fn current_state(&self, _song: Uuid) -> Option<Vec<u8>> {
        None
    }

    pub fn close_room(&self, _song: Uuid, _code: u16) {}
}
