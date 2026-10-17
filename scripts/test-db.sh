#!/usr/bin/env bash
# Database tests. Runs ONLY against a throwaway local Postgres (never prod):
#   PGHOST=/path/to/socket PGPORT=5432 PGUSER=postgres scripts/test-db.sh
#
# Database 1: stub -> 0019 -> 0020 -> seed -> 0021 (twice, proving re-runs
#             are safe) -> 0021 tests -> 0022 -> 0022 tests -> 0023 -> tests.
# Database 2: stub -> 0019 -> 0020 -> seed -> 0021 -> rollback -> 0021.
set -euo pipefail
cd "$(dirname "$0")/../supabase/tests"

MAIN="bw_test_main_$$"
ROLL="bw_test_rollback_$$"
cleanup() {
  psql -q -d postgres -c "drop database if exists $MAIN" >/dev/null 2>&1 || true
  psql -q -d postgres -c "drop database if exists $ROLL" >/dev/null 2>&1 || true
}
trap cleanup EXIT

apply() { # db file
  if ! out=$(psql -v ON_ERROR_STOP=1 -q -d "$1" -f "$2" 2>&1); then
    echo "Failed applying $2:"; echo "$out" | grep -v wal_level; exit 1
  fi
}
check() { # db file
  out=$(psql -v ON_ERROR_STOP=1 -q -d "$1" -f "$2" 2>&1) || { echo "$out" | grep -E "FAIL|ERROR" ; exit 1; }
  echo "$out" | sed -n 's/^psql:[^ ]* NOTICE:  \(ok - .*\)/\1/p; /^--- /p; /PASSED/p'
}

base() { # db
  psql -q -d postgres -c "create database $1" >/dev/null
  apply "$1" 00_supabase_stub.sql
  apply "$1" ../migrations/0019_store_order_integrity.sql
  apply "$1" ../migrations/0020_store_customer_accounts_and_order_chat.sql
  apply "$1" 10_seed_pre_0021.sql
  apply "$1" 15_capture_pre_0021.sql
  apply "$1" ../migrations/0021_store_shared_admin_inbox.sql
}

base "$MAIN"
apply "$MAIN" ../migrations/0021_store_shared_admin_inbox.sql   # second run
check "$MAIN" 20_shared_inbox_test.sql
apply "$MAIN" ../migrations/0022_store_order_fulfillment_details.sql
check "$MAIN" 25_fulfillment_test.sql
apply "$MAIN" ../migrations/0023_store_chat_legacy_cleanup.sql
check "$MAIN" 30_cleanup_test.sql

base "$ROLL"
check "$ROLL" 40_rollback_test.sql
