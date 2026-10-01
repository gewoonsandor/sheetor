-- Appearance follows the account to every browser. No row until the first save:
-- the browser then uploads what it already had, so nobody's choice resets.
CREATE TABLE user_appearance (
  user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  theme TEXT NOT NULL,
  accent TEXT NOT NULL,
  paper_score BOOLEAN NOT NULL DEFAULT false
);
