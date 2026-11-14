#!/usr/bin/env bash
# SessionStart hook for Claude Code cloud sessions only: start the container's Postgres and
# make sure the role and databases the project expects exist. Credentials match CI and the
# integration-test default (postgresql://songnoi:songnoi@localhost:5432/songnoi_test).
# Idempotent and never fails the session: every error is swallowed and we exit 0.

[ "$CLAUDE_CODE_REMOTE" = "true" ] || exit 0

{
  service postgresql start

  # Wait for the server to accept connections (up to ~10s).
  for _ in $(seq 1 20); do
    runuser -u postgres -- pg_isready -q && break
    sleep 0.5
  done

  psql_admin() { runuser -u postgres -- psql -v ON_ERROR_STOP=1 -Atq "$@"; }

  psql_admin <<'SQL'
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'songnoi') THEN
    CREATE ROLE songnoi LOGIN CREATEDB PASSWORD 'songnoi';
  END IF;
END
$$;
SQL

  for db in songnoi songnoi_shadow songnoi_test; do
    if [ "$(psql_admin -c "SELECT 1 FROM pg_database WHERE datname = '$db'")" != "1" ]; then
      psql_admin -c "CREATE DATABASE $db OWNER songnoi"
    fi
  done
} >/dev/null 2>&1

exit 0
