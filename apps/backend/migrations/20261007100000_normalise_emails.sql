-- Addresses are stored trimmed and lowercased from now on, and looked up the same way.
-- Rewrite every stored one that no other account shares in that form.
UPDATE users AS u
SET email = lower(btrim(u.email))
WHERE u.email <> lower(btrim(u.email))
  AND NOT EXISTS (
    SELECT 1 FROM users AS other
    WHERE other.id <> u.id AND lower(btrim(other.email)) = lower(btrim(u.email))
  );

-- The database's own guard against two accounts differing only by case, for any write that
-- skips the service's normalisation. A duplicate is still a 409: queries/users.rs maps this
-- name beside users_email_key.
-- ponytail: accounts that already differ only by case are left as they are, and the guard
-- waits for them: merge or rename them by hand, then create this index.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM users GROUP BY lower(email) HAVING count(*) > 1) THEN
    RAISE WARNING 'users: some addresses differ only by case; users_email_lower_key not created';
  ELSE
    CREATE UNIQUE INDEX users_email_lower_key ON users (lower(email));
  END IF;
END $$;
