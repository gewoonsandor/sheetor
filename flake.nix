{
  description = "Sheetor — guitar TAB + sheet-music editor (axum backend + React frontend)";

  inputs.nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";

  outputs =
    { self, nixpkgs }:
    let
      systems = [
        "x86_64-linux"
        "aarch64-linux"
        "x86_64-darwin"
        "aarch64-darwin"
      ];
      forAllSystems = nixpkgs.lib.genAttrs systems;
    in
    {
      devShells = forAllSystems (
        system:
        let
          pkgs = nixpkgs.legacyPackages.${system};
        in
        {
          default = pkgs.mkShell {
            packages = [
              pkgs.nodejs_24
              pkgs.rustc
              pkgs.cargo
              pkgs.clippy
              pkgs.rustfmt
              pkgs.rust-analyzer
              pkgs.cargo-watch
              # sqlx-cli for migrations. nixpkgs builds it with the postgres
              # backend already; it uses native-tls rather than rustls, which
              # only changes which TLS stack gets linked, not what works.
              pkgs.sqlx-cli
              pkgs.postgresql
            ];

            env.RUST_SRC_PATH = "${pkgs.rustPlatform.rustLibSrc}";
            # Local dev database. sqlx needs this at runtime (init_pool) and,
            # if the query_as! macros are used, at compile time too.
            env.DATABASE_URL = "postgres://postgres@127.0.0.1/sheetor";
            # The browser's origin in dev: SSO redirects and the WebSocket
            # Origin check both need Vite's port, not axum's.
            env.PUBLIC_URL = "http://localhost:5173";
            # Swagger UI on /docs; off unless set, so production does not publish the API map.
            env.DOCS_ENABLED = "true";

            # ponytail: repo-local cluster in the gitignored .direnv/, trust
            # auth, autostarted on shell entry and left running on exit. Fine
            # for one dev on one machine; if you ever need it managed, stopped
            # with the shell, or shared, that is services-flake's job.
            shellHook = ''
              export PGDATA="$PWD/.direnv/pgdata" PGHOST=127.0.0.1 PGUSER=postgres
              if [ ! -d "$PGDATA" ]; then
                initdb --auth=trust --username=postgres >/dev/null
              fi
              if ! pg_ctl status >/dev/null 2>&1; then
                pg_ctl start -w -l "$PGDATA/server.log" \
                  -o "-k $PGDATA -h 127.0.0.1 -p 5432" >/dev/null
                createdb sheetor 2>/dev/null || true
                createdb sheetor_test 2>/dev/null || true
              fi

              echo "sheetor: node $(node --version), npm $(npm --version), $(rustc --version)"
              echo "postgres: $(psql -tAc 'select version()' postgres | cut -d, -f1) on :5432 ($PGDATA)"
              echo "npm install && npm run dev  ->  http://localhost:5173 (api proxied to :4000)"
            '';
          };
        }
      );

      formatter = forAllSystems (system: nixpkgs.legacyPackages.${system}.nixfmt-tree);
    };
}
