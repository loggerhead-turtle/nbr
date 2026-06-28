#!/usr/bin/env bash
#
# Stand up a LOCAL, NON-PROD Postgres for the MaxPreps prototype and apply the
# NBR schema to it. Idempotent: safe to re-run. Prints the DATABASE_URL to use.
#
# This exists because Claude Code web sessions are ephemeral — the DB does not
# survive container reclaim, so we recreate it from this script instead.
#
# Requires: postgresql server tools (initdb/pg_ctl/psql) installed locally.
# Postgres refuses to run as root, so the cluster runs as the `postgres` user.
set -euo pipefail

PORT="${NBR_DEV_DB_PORT:-5433}"
DBNAME="nbr"
DBUSER="nbr"
RUNUSER="postgres"
PGBIN="$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1)"
[ -n "$PGBIN" ] || { echo "ERROR: postgresql server tools not found"; exit 1; }
PGHOME="$(getent passwd "$RUNUSER" | cut -d: -f6)"
PGDATA="$PGHOME/nbr_pgdata"
LOG="$PGHOME/nbr_pg.log"
SOCKHOST="127.0.0.1"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
MIGDIR="$ROOT/packages/db/prisma/migrations"

run() { runuser -u "$RUNUSER" -- "$@"; }
psql_db() { run "$PGBIN/psql" -h "$SOCKHOST" -p "$PORT" -U "$DBUSER" -d "$DBNAME" "$@"; }

# 1) init cluster if absent
if [ ! -f "$PGDATA/PG_VERSION" ]; then
  echo "[dev-db] initdb -> $PGDATA"
  run bash -c "rm -rf '$PGDATA'; '$PGBIN/initdb' -D '$PGDATA' -U '$DBUSER' --auth=trust -E UTF8" >/dev/null
fi

# 2) start if not running
if ! run "$PGBIN/pg_ctl" -D "$PGDATA" status >/dev/null 2>&1; then
  echo "[dev-db] starting postgres on $SOCKHOST:$PORT"
  run bash -c "'$PGBIN/pg_ctl' -D '$PGDATA' -o \"-p $PORT -c listen_addresses='$SOCKHOST'\" -l '$LOG' -w start" >/dev/null
fi

# 3) create db if absent
if ! run "$PGBIN/psql" -h "$SOCKHOST" -p "$PORT" -U "$DBUSER" -d postgres -tAc \
     "select 1 from pg_database where datname='$DBNAME'" | grep -q 1; then
  echo "[dev-db] createdb $DBNAME"
  run "$PGBIN/createdb" -h "$SOCKHOST" -p "$PORT" -U "$DBUSER" "$DBNAME"
fi

# 4) apply migrations as raw SQL (skips Prisma's engine download). Guarded by a
#    sentinel so re-runs don't re-CREATE existing tables.
if ! psql_db -tAc "select to_regclass('public.\"Team\"')" | grep -q Team; then
  echo "[dev-db] applying migrations"
  for d in $(ls -d "$MIGDIR"/*/ | sort); do
    f="${d}migration.sql"
    [ -f "$f" ] || continue
    psql_db -v ON_ERROR_STOP=1 -f "$f" >/dev/null
    echo "  applied $(basename "$d")"
  done
else
  echo "[dev-db] schema already present — skipping migrations"
fi

DBURL="postgresql://$DBUSER@$SOCKHOST:$PORT/$DBNAME?schema=public"
echo
echo "[dev-db] READY (non-prod). DATABASE_URL:"
echo "  $DBURL"
echo "[dev-db] tables: $(psql_db -tAc "select count(*) from information_schema.tables where table_schema='public'")"
