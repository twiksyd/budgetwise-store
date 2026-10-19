# Historical chat consolidation (0035)

This change has **not** been applied to production. Do not apply 0023, change
Realtime public access, or modify XOB schema/status. The migration defaults OFF.

## Data model and safety

`store_chat_history_links` associates an original order chat with the account's
existing General Inquiry/customer conversation. It does **not** set the original
thread's `home_key`, copy messages, or update their `order_number`/`order_ref`.
Snapshots, frozen lines, attachments, reactions, quotes, audit rows and payment
confirmations keep their original identities. Unique source keys make retries
idempotent. Views revalidate source snapshot and destination account ownership.

`store_link_historical_chat(source, admin)` requires:

- The feature flag is enabled and the actor is an existing admin (service-only RPC).
- A real order, frozen order lines, a non-null authenticated snapshot owner, and
  a source order thread with messages; the order is not already linked by 0033.
- That **same account ID** owns an existing inquiry with a conversation row.
  Names, Roblox names, email similarity, and phone numbers are never matched.
- The source is Done **or** its latest customer message has an admin reply after it.
  Active chats must also have the same assignment as the destination.
- No customer message is unread for **any existing admin**, using exactly that
  admin's existing read cursor/unread-since baseline, and no admin message is
  unread for the customer. Done alone does not bypass these checks.

The conservative unread checks mean some of the approximately 224 historical
chats may stay separate, including Done chats. This is intentional. Never bulk
advance cursors, mark chats Done, fabricate replies, or confirm payments to make
more chats eligible. Completing a legacy chat in the updated app retries linking;
if another admin/customer still has unread work, it remains visible and can be
retried later by the reviewed backfill. No background job auto-clears unread state.

Source-thread locks serialize linking with message insertion; source conversation
locks serialize assignment/Done changes. Concurrent customer messages either win
and prevent linking, or receive `BW030 / CHAT_MOVED` after a link wins. Old admin
tabs also cannot reopen or reassign an archived source. Linking does not update
any assignment, cursor, reply/attention, Done, or payment fields.

## Presentation and interactions

The inbox and customer conversation list omit only active historical mappings.
The primary row retains its original assignment, attention and read state; games,
order counts, search and Under Review include linked orders through an indexed
read-side thread view. Source conversation rows remain intact for audit/recovery.

The message RPC merges indexed source pages in `(created_at, id)` order. The UUID
breaks timestamp ties; source identity stays in each DTO. Page size remains 50.
Albums, public admin names, quote targets, confirmations and reactions are loaded
in batches. No per-message auth queries or per-source realtime subscriptions are
added. An order divider appears when source context changes. Existing full-screen
mobile scrolling/anchor preservation remain; scrolling respects reduced motion.

Old customer/admin order URLs open the primary conversation with `?focus=BW-…`.
A source-checked locator loads at most 50 messages around the target. This is an
explicit earlier-message window, not a discontinuous insert into the latest
page. Return to latest reloads a fresh page and restores the composer. Realtime
deltas pause in that earlier window; reactions/payments still patch individual
messages. Existing same-source quoted replies can jump to their original.

New text/albums always use the current conversation. Archived sources reject
all message inserts at database level, including old browser builds. New quoted
replies cannot reference an old source: the UI explains that the user should
send a new message mentioning that order. The database's same-chat FK trigger
continues to reject cross-chat reply references.

Reaction and confirmation routes first authorize the requested conversation,
then verify the message is in its source set, then call the existing operation
against **the message's original chat**. Media/QR URLs likewise authorize the
original message/chat. The browser never gets storage paths or private admin IDs.
Single-card payment refreshes and reaction patches reuse the current cache.
Per-order payment state is a single server-side batch of latest-card lookups,
so a REST row limit cannot hide a newer unconfirmed card.

Historical payment cards keep the original payload and order context. New cards
for those orders are posted at home with the real `order_ref`, using the frozen
order total. Latest-card checks cover both the original chat and that order's
new tagged cards; inquiry quotes and other orders are separate subjects. Each
confirmation/audit entry records the original card/chat. Receipt uploads cannot
confirm payment. The primary inbox suppresses its aggregate Paid badge when
historical sources are present, because the old home-only badge cannot certify
all historical orders. Per-order slips and original payment cards remain the
authority, including mixed paid/unpaid orders. This conservative badge behavior
is a known limitation; it never labels unpaid history Paid.

## Reviewed production sequence (operator actions, not performed by this PR)

1. Confirm migrations 0021, 0022, and 0024–0034 exist. **Skip 0023.** Back up the
   database using the existing operational process. Inspect the new SQL and
   current constraints. No production credentials are needed for local tests.
2. Apply **only** `supabase/migrations/0035_store_historical_chat_links.sql` using
   the normal reviewed SQL process. It is transactional and rerunnable; the flag
   remains false and no chats are linked. If interrupted, rerun the whole file.
3. Deploy this PR's app code through the normal deployment process. This PR does
   not deploy. Check original order chats and the new unified conversation with
   the flag still false. Allow old clients to reload before enabling consolidation.
4. Enable using an authorized SQL/service-role session:

   ```sql
   update public.store_chat_settings
      set historical_chat_enabled = true, updated_at = now()
    where id;
   ```

5. Inspect candidate source keys and owner IDs with read-only SQL. Supply the
   actual verified admin UUID as `:admin_id`, never a guessed customer identity.
   Run one reviewed source first; a false result means it remains separate:

   ```sql
   select public.store_link_historical_chat('BW-REALORDER', :'admin_id'::uuid);
   ```

   Inspect its mapping, original messages, read cursors, payments and both UIs.
   For the historical backfill, enumerate only unlinked order-thread sources:

   ```sql
   select t.key, s.owner_user_id, c.state
     from public.store_chat_threads t
     join public.store_order_snapshots s on s.order_number = t.key
     join public.store_order_conversations c on c.order_number = t.key
    where t.kind = 'order' and t.home_key is null
      and not exists (select 1 from public.store_chat_history_links h
                       where h.source_key = t.key)
    order by t.key;
   ```

   Call `store_link_historical_chat` once per reviewed key, preferably one
   transaction per source, and record true/false results. It independently checks
   eligibility under locks; the candidate query is not an authorization decision.
   Never force mappings with direct table inserts. Retry false results only after
   actual work/read state changes. Do not create inquiries or infer ownership for
   unmatched orders. New orders continue through 0033 during backfill.

6. Check old deep links, mobile history, legacy receipts/payment cards, source
   reaction patches, Needs Reply/unread filters, game filters, and two customers'
   access isolation. Keep remaining ineligible conversations visible. The change
   can be interrupted/resumed; completed mappings and message identities persist.

## Recovery

Disable presentation/new linking without deleting anything:

```sql
update public.store_chat_settings
   set historical_chat_enabled = false, updated_at = now()
 where id;
```

Reload affected tabs. Original source inbox rows and messages reappear. Already
mapped sources **stay read-only**, with a link to continue in the current
conversation. Existing 0033 order routing is unaffected. Historical payment
supersession checks keep considering cards already sent at home, even with the
flag off. Re-enable to restore the saved presentation. No mapping or message is
removed. Do not roll back by dropping this migration or reverting the app alone:
new cards may exist in the unified conversation and archived sources need the
read-only UI. Recover forward with the flag off and this compatible app version.

## Local validation (no Docker, no production credentials)

Use Node 24 and the locked pnpm dependencies. Install the portable PostgreSQL
package outside this checkout if PostgreSQL is not already available. Run it as
an unprivileged user on a loopback port, with a disposable data directory. The
existing Node runner creates/drops its own test databases:

```sh
pnpm install --frozen-lockfile
pnpm exec tsc --noEmit
pnpm lint
pnpm test:chat
pnpm test:order-integrity
# Set PGHOST=127.0.0.1 PGPORT=<portable port> PGUSER=<test user> and PGPASSWORD securely.
node scripts/test-db.mjs --history-only
node scripts/test-db.mjs --without-legacy-cleanup
pnpm build
```

`--without-legacy-cleanup` is required for this production-compatible path; it
never executes 0023. The historic default runner still retains its pre-existing
cleanup-migration coverage for other tasks. `--history-only` exercises 0035 twice,
fixtures and real multi-session races without unrelated benchmark suites.

For the browser presentation contract, start the local dev server with a local
Supabase test URL and clearly synthetic test-only keys (no production values),
then:

```sh
E2E_BASE_URL=http://127.0.0.1:3100 E2E_CHROMIUM=/usr/bin/chromium \
  node --test --test-concurrency=1 scripts/e2e/historical-chat-ui.e2e.mjs
```

This browser suite mocks HTTP chat APIs and exercises 390px, 430px and desktop
layouts, old-link redirect/focus, source labels, bounded requests, window return,
composer gating, duplicate prevention and reduced motion. SQL tests exercise
real ownership, messages, albums, replies, payment confirmations, realtime
broadcast payloads, ordering, cursor rejection, recovery and concurrent sessions.
A live Supabase auth/storage/realtime end-to-end run remains a deployment gate;
mocked browser tests and SQL broadcast assertions do not substitute for it.
