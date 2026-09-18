CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  username VARCHAR(64) NOT NULL,
  email VARCHAR(255) NOT NULL UNIQUE,
  password_hash VARCHAR(255),

  provider VARCHAR(255) NOT NULL DEFAULT 'local',
  provider_id VARCHAR(255)
);
