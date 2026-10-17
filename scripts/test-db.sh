#!/usr/bin/env bash
# Runs the database tests against a THROWAWAY Postgres (never production).
#   PGHOST=/path/to/socket PGPORT=5432 PGUSER=postgres scripts/test-db.sh
# Creates a fresh database, loads a minimal Supabase stub, applies the order
# migrations in sequence, seeds data, then runs the assertions.
set -euo pipefail
cd "$(dirname "$0")/.."

DB="bw_test_$$"
psql -v ON_ERROR_STOP=1 -q -d postgres -c "create database $DB" >/dev/null
trap 'psql -q -d postgres -c "drop database if exists $DB" >/dev/null' EXIT

run() { psql -v ON_ERROR_STOP=1 -q -d "$DB" -f "$1" 2>&1 | grep -v -E "wal_level|Set wal_level" || true; }

for f in \
  supabase/tests/00_supabase_stub.sql \
  supabase/migrations/0019_store_order_integrity.sql \
  supabase/migrations/0020_store_customer_accounts_and_order_chat.sql \
  supabase/tests/10_seed_pre_0021.sql \
  supabase/migrations/0021_store_shared_admin_inbox.sql
do
  psql -v ON_ERROR_STOP=1 -q -d "$DB" -f "$f" >/dev/null 2>&1 || {
    echo "Failed applying $f"; psql -v ON_ERROR_STOP=1 -q -d "$DB" -f "$f"; exit 1; }
done

psql -v ON_ERROR_STOP=1 -q -d "$DB" -f supabase/tests/20_shared_inbox_test.sql 2>&1 \
  | sed -n 's/^psql:[^ ]* NOTICE:  //p; /PASSED/p; /FAIL/p; /ERROR/p'
