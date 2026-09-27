-- One account per identity at a provider. Rows without a provider_id stay unconstrained.
ALTER TABLE users ADD CONSTRAINT users_provider_identity_key UNIQUE (provider, provider_id);
