CREATE TABLE folders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  -- No cascade: deleting a folder reparents its children first, it never drops a subtree.
  parent_id UUID REFERENCES folders(id),
  name VARCHAR(120) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX folders_owner_id_idx ON folders (owner_id);
CREATE INDEX folders_parent_id_idx ON folders (parent_id);

CREATE TABLE songs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  folder_id UUID REFERENCES folders(id) ON DELETE SET NULL,
  title VARCHAR(200) NOT NULL,
  artist VARCHAR(200) NOT NULL,
  bpm INTEGER NOT NULL,
  track_count INTEGER NOT NULL,
  bar_count INTEGER NOT NULL,
  state BYTEA NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by INTEGER REFERENCES users(id) ON DELETE SET NULL
);
CREATE INDEX songs_owner_id_idx ON songs (owner_id);
CREATE INDEX songs_folder_id_idx ON songs (folder_id);

CREATE TABLE folder_shares (
  folder_id UUID NOT NULL REFERENCES folders(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('viewer', 'editor')),
  PRIMARY KEY (folder_id, user_id)
);

-- The best role a user holds on a folder: owning any folder on the path to the root,
-- else the strongest share on that path. NULL means no access.
CREATE FUNCTION folder_role(p_user INTEGER, p_folder UUID) RETURNS TEXT
LANGUAGE sql STABLE AS $$
  WITH RECURSIVE chain AS (
      SELECT id, parent_id, owner_id FROM folders WHERE id = p_folder
    UNION ALL
      SELECT f.id, f.parent_id, f.owner_id FROM folders f JOIN chain c ON f.id = c.parent_id
  )
  SELECT CASE
    WHEN EXISTS (SELECT 1 FROM chain WHERE owner_id = p_user) THEN 'owner'
    WHEN EXISTS (SELECT 1 FROM folder_shares s JOIN chain c ON s.folder_id = c.id
                 WHERE s.user_id = p_user AND s.role = 'editor') THEN 'editor'
    WHEN EXISTS (SELECT 1 FROM folder_shares s JOIN chain c ON s.folder_id = c.id
                 WHERE s.user_id = p_user) THEN 'viewer'
  END
$$;
