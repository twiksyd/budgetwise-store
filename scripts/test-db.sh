#!/usr/bin/env bash
# Database tests. Runs ONLY against a throwaway local Postgres (never prod):
#   PGHOST=/path/to/socket PGPORT=5432 PGUSER=postgres scripts/test-db.sh
#
# Database 1: stub -> 0019 -> 0020 -> seed -> 0021 (twice, proving re-runs
#             are safe) -> 0021 tests -> 0022 -> 0022 tests -> 0024 (twice)
#             -> 0024 tests -> 0023 -> tests -> 0024 again (works after 0023).
# Database 2: stub -> 0019 -> 0020 -> seed -> 0021 -> rollback -> 0021,
#             then 0022 -> 0024 -> 0024 rollback (refused with an album),
#             real albums -> flatten -> 0024 rollback -> 0024 again.
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
apply "$MAIN" ../migrations/0022_store_order_fulfillment_details.sql   # second run
check "$MAIN" 25_fulfillment_test.sql
apply "$MAIN" ../migrations/0024_store_conversation_workflow_and_albums.sql
apply "$MAIN" ../migrations/0024_store_conversation_workflow_and_albums.sql   # second run
check "$MAIN" 26_workflow_albums_test.sql
apply "$MAIN" ../migrations/0023_store_chat_legacy_cleanup.sql
check "$MAIN" 30_cleanup_test.sql
apply "$MAIN" ../migrations/0024_store_conversation_workflow_and_albums.sql   # after 0023 too

base "$ROLL"
check "$ROLL" 40_rollback_test.sql
# 0024 rollback: refused while an album exists, clean otherwise.
apply "$ROLL" ../migrations/0022_store_order_fulfillment_details.sql
apply "$ROLL" ../migrations/0024_store_conversation_workflow_and_albums.sql
psql -q -d "$ROLL" -c "insert into store_order_messages (order_number, sender_role, sender_user_id, kind, body) values ('BW-AAAAAA', 'admin', '00000000-0000-0000-0000-0000000000a1', 'album', '')" >/dev/null
if psql -v ON_ERROR_STOP=1 -q -d "$ROLL" -f ../rollback/0024_down.sql >/dev/null 2>&1; then
  echo "FAIL: 0024 rollback ran although an album exists"; exit 1
fi
echo "ok - 0024 rollback refuses while an album exists"
psql -q -d "$ROLL" -c "delete from store_order_messages where kind = 'album'; update store_order_conversations set last_message_kind = 'text' where last_message_kind = 'album'" >/dev/null
# Recovery after albums were sent: flatten them into single images, then roll back.
check "$ROLL" 43_albums_before_flatten.sql
apply "$ROLL" ../rollback/0024_flatten_albums.sql
check "$ROLL" 44_flatten_albums_test.sql
apply "$ROLL" ../rollback/0024_flatten_albums.sql   # second run: nothing left to do
apply "$ROLL" ../rollback/0024_down.sql
check "$ROLL" 45_rollback_0024_test.sql
apply "$ROLL" ../migrations/0024_store_conversation_workflow_and_albums.sql   # re-apply after rollback
