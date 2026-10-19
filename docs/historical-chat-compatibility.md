# Historical chat compatibility upgrade (0036)

0035 is already deployed; consolidation remains OFF. This PR does not apply SQL,
initialize production customers, approve sources, link history, merge, or deploy.
0036 supersedes the linking prerequisites in the original 0035 runbook.
Never run 0023. No XOB logic or Realtime access settings change.

## Schema and eligibility

Apply only `supabase/migrations/0036_store_historical_chat_compatibility.sql`,
after 0035. The transaction is rerunnable and leaves both switches OFF/unchanged:
`historical_chat_enabled` is never updated; the new `historical_chat_compat_ready`
defaults false. The latter prevents an older application from using relaxed links
between migration and application deployment.

Conversation last-message ID/time/kind/sender may now be **all NULL** for a real
empty conversation; a shape check rejects partial activity. Creation timestamps
record real metadata creation, never invented message activity. The first real
message fills activity through the existing insert trigger. Empty unlinked homes
stay out of both inboxes. Empty linked homes display activity from real historical
messages without persisting fake home message metadata.

The service-only initializer verifies snapshot ownership against an existing Auth
UUID and an actual order. It reuses the unique inquiry for that UUID, serializes
on a customer advisory lock and the actual inquiry thread, refuses conflicting
inquiry ownership, and inserts missing metadata only. It reconstructs last
message, customer/reply activity and payment metadata from real inquiry records.
Existing metadata/state/assignments/cursors are preserved. There are no messages,
orders, frozen order lines, payment associations or customer identities created
by initialization. `store_initialize_customer_batch` accepts at most 25 explicit
UUIDs, in sorted order; an invalid customer rolls back that batch.

Done historical sources may retain missing/lagging personal admin read cursors
and genuine customer unread. Active sources still need an admin reply after the
latest customer message, matching destination assignment, and zero unread for
**every** admin and the customer. Active Needs Reply and assignment conflicts
remain separate. Real order/lines/messages, verified ownership, a usable inquiry,
both switches and an unexpired approval for that exact source/home/owner are
required. The linker rechecks these facts under locks; review is informational.

`store_history_approvals` is a private per-source allowlist with batch, actor,
captured identities and expiry (maximum seven days). `store_history_operations`
audits initialization, approvals, and bounded link attempts. Original link audit
records remain authoritative. Retry-safe batches accept at most 25 source keys.
New links serialize through a transaction advisory lock, including the existing
post-Done hook, so overlapping direct and batch operations cannot deadlock by
acquiring destinations and sources in different orders. Ordinary message writes
do not take that lock. The global switch alone cannot select new sources.

## Read state and review

`/admin/history` shows up to 20 verified customers, with up to 50 historical orders
per customer and explicit pagination. It displays original assignment, Done /
Needs Reply, customer unread, each admin's personal unread and eligibility reason.
It fetches metadata only: no thread open, read acknowledgment, assignment or state
mutation. Opening the labeled existing workflow link intentionally enters normal
chat read behavior. Resolve genuine work there; legacy shared read evidence is
not substituted for an individual admin's cursor. Do not bulk-clear cursors.

The inbox adds each historical source's unread count using its own cursor and
that admin's existing `unread_since`. Customer counts use each original source's
customer cursor. Home reads cannot clear historical unread. A Done home with
historical unread is discoverable in Unread without changing its Done state.
Unread source pills open bounded windows at the first unread message. Historical
messages never auto-acknowledge on scrolling. A received message group offers an
explicit **Mark BW-… read through this message** control; the authorized server
resolves that actual message to its original source. Other sources and other
admins' cursors remain unchanged. Customers use the same source-aware flow.

Source read updates refresh the existing admin inbox / home chat / customer
topics. There are no per-source browser subscriptions or changes to topic access.
The existing stable `(created_at,id)` pagination, caches, legacy deep links,
media storage, reactions, quotes and original payment subjects are retained.
Explicit Done actions accept real visible historical messages as their stale-work
check; closing a home never closes or acknowledges its sources.

## Reviewed deployment and pilot sequence (NOT executed)

1. Apply **0036 only**, with 0035 already present. Keep `historical_chat_enabled`
   false. Confirm the new readiness switch is false and no new mappings exist.
2. Deploy this PR's application through the normal reviewed process. Verify the
   existing inbox/chat workflows while OFF. Reload old admin/customer clients
   before readiness is enabled; retain the new app for rollback compatibility.
3. Review `/admin/history`. Initialize verified missing UUIDs in explicit groups
   of at most 25; initialization does not link or enable history. Example operator
   template (psql placeholders, never guessed identifiers):

   ```sql
   select * from public.store_initialize_customer_batch(
     array[:'verified_customer_uuid'::uuid], :'verified_admin_uuid'::uuid);
   ```

4. For ONE approved eligible order, generate and record a batch UUID. Capture
   read-only before snapshots/hashes of its messages, attachments, payment
   confirmations, order/snapshot ownership, conversation metadata and all read
   cursors. Approve exactly that source, using an initialized verified home:

   ```sql
   select public.store_approve_history_batch(
     array[:'selected_order_number'], :'verified_admin_uuid'::uuid,
     :'recorded_batch_uuid'::uuid, now() + interval '1 hour');
   ```

5. Only after separate activation approval and successful deployment validation:

   ```sql
   begin;
   update public.store_chat_settings
      set historical_chat_compat_ready = true, historical_chat_enabled = true,
          updated_at = now()
    where id;
   select * from public.store_link_history_batch(
     array[:'selected_order_number'], :'verified_admin_uuid'::uuid,
     :'recorded_batch_uuid'::uuid);
   commit;
   ```

   A false link result leaves the source separate. Do not bypass it. Recheck
   blockers in review. Approval does not automatically initialize or link.
6. Verify the one expected mapping, no duplicate inbox source, both customer and
   admin source unread, legacy links, payment subjects and unchanged before/after
   data. Explicit reads are expected to advance only their chosen original cursor.
   Pilot with two admins to confirm read isolation. Test flag-off recovery before
   approving further sources. Later batches must use explicitly reviewed keys,
   at most 25 per transaction, with recorded batch UUIDs and returned outcomes.
   There is no cron, production scanner, or automatic production backfill.

## Recovery

Disable presentation and further linking without deleting any mappings:

```sql
update public.store_chat_settings
   set historical_chat_enabled = false, updated_at = now()
 where id;
```

This restores original source rows and keeps all mappings/messages/payment/read
records. Mapped sources remain read-only to prevent divergent histories; replies
continue in the real current conversation. Keep the compatibility app deployed
while mapped sources carry unread. Do not roll back 0036 or deploy a pre-0036 app
as recovery: nullable empty metadata and source unread require the new app.
The readiness switch may also be set false to block further linking while
retaining current presentation. Expired approvals cannot authorize new links.

## Local validation

Use Node 24, locked pnpm dependencies, portable PostgreSQL 17 on localhost;
never Docker or a production database. Run:

```sh
pnpm install --frozen-lockfile
pnpm exec tsc --noEmit
pnpm lint
pnpm test:chat
pnpm test:order-integrity
pnpm test:order-message
PGHOST=127.0.0.1 PGPORT=54331 PGUSER=postgres pnpm test:db:node --without-legacy-cleanup
pnpm build
```

Supply the local database password through the process environment. The runner
rejects remote hosts, creates disposable databases, applies 0036 twice, tests
110 customer initializations (including 24 metadata gaps), concurrent creation /
linking, preserved unread/cursors/payment identities and recovery, and repeats
the unchanged 100,000-conversation performance tests after 0036. Both enabled
and disabled inbox queries must remain under the existing 100 ms threshold.

The local browser contract uses mocked chat APIs, including explicit original
source acknowledgments at 390/430/1440 px with reduced motion; it does not claim
live Supabase Auth/Realtime coverage. Run against a local Next dev server:

```sh
E2E_BASE_URL=http://127.0.0.1:3101 E2E_CHROMIUM=/usr/bin/chromium \
  node --test scripts/e2e/historical-chat-ui.e2e.mjs
```

Production builds require reachable Google Fonts hosts for the existing Geist /
Geist Mono / Manrope configuration. A blocked font download is a build limitation,
not a passing build. Authenticated live-stack E2E requires a separate local
Supabase fixture; portable database and mocked-browser tests cover these changes.

## Validation recorded for this branch

- TypeScript passes. ESLint has zero errors and one existing unrelated warning
  in `src/app/opengraph-image.tsx`.
- 289 chat tests, 36 order-integrity tests and 15 order-message tests pass.
- Full portable PostgreSQL 17 suite passes with `--without-legacy-cleanup`.
  The final focused compatibility rerun also passes after the additional
  ownership-conflict, concurrent-message and real Unread-filter assertions.
- The unchanged post-0036 100,000-conversation benchmark passes all six inbox
  filters with both flag states (approximately 10–21 ms enabled, 2–5 ms disabled
  in local runs; existing limit 100 ms). These are database timings, not a
  measurement of network latency or a production capacity guarantee.
- Three local mocked-browser tests pass at 390, 430 and 1440 px, including legacy
  navigation, bounded unread jumps, no automatic historical acknowledgment,
  explicit source acknowledgment, reduced motion and overflow checks.
- Production build is blocked by Google Fonts downloads in this environment.
  Live authenticated Supabase/Realtime E2E has not been run.
