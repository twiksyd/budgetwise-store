This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

## Customer accounts and on-site order chat

Customers sign in with Google to order, and chat with the team on the order's
page (`/orders/<order number>`). The team replies from `/admin/orders`.

One-time setup:

1. Run `supabase/migrations/0020_store_customer_accounts_and_order_chat.sql`.
   It adds order ownership, the `store_order_messages` table, a private
   `order-chat-attachments` Storage bucket, and turns on Realtime for chat.
2. In Google Cloud Console, create an OAuth client (type: Web application).
   Add `https://<your-supabase-project>.supabase.co/auth/v1/callback` as an
   authorized redirect URI.
3. In Supabase, go to Authentication → Providers → Google, enable it, and
   paste the client ID and secret.
4. In Supabase, go to Authentication → URL Configuration. Set the Site URL to
   the production domain and add `<domain>/auth/callback` (and
   `http://localhost:3000/auth/callback` for local work) to the Redirect URLs.

Chat falls back to polling every few seconds if Realtime is unavailable.

## Shared admin inbox (`/admin/orders`)

Three-panel inbox for several admins at once: conversation list, realtime
chat, and the order details panel (built from order records, never chat
text). Assignment, per-admin unread counts, server-verified typing/viewing
indicators, quick replies (`/shortcut`), structured payment details, and
structured gamepass links for Robux (Via Link) orders.

Conversations are **Active** (the working queue) or **Done** (handled).
That is BudgetWise's own workflow state, separate from XOB's `orders.status`.
A customer message reopens a Done conversation automatically; customers see
In progress / Completed ✓. Messages can carry albums of up to 10 images
(thumbnails made in the browser, files in the private bucket, served through
`/api/order-chat/media/<id>` after an owner/admin check).

Customers get a full-screen Messenger-style order chat on phones, a floating
messages button with a live unread badge (private `customer:<user id>`
realtime topic), My Orders in the header, and My Orders sorted into unread,
active and completed (paginated).

Database changes, in order (see each file's header):

1. `supabase/migrations/0021_store_shared_admin_inbox.sql` — inbox foundation
2. `supabase/migrations/0022_store_order_fulfillment_details.sql` — gamepass links
3. `supabase/migrations/0024_store_conversation_workflow_and_albums.sql` —
   Active/Done state, image albums, customer realtime topic (safe before the
   code: the previous code ignores it)
4. Deploy the application code
5. `supabase/migrations/0023_store_chat_legacy_cleanup.sql` — only after every
   open browser tab runs the new code; then turn off Realtime "Allow public access"

`supabase/rollback/0021_down.sql` undoes 0021 (only before 0023).
`supabase/rollback/0024_down.sql` undoes 0024 (refused once any album exists).

Tests:

- `pnpm test:chat` — application logic (routes, identity, state, validation)
- `pnpm test:db` — database tests against a throwaway local Postgres
  (`PGHOST=... PGPORT=... PGUSER=postgres pnpm test:db`)
- `pnpm test:e2e` — three admins + customers in real browsers (phones at
  390x844 and 430x932) against a LOCAL Supabase stack (`supabase start` with
  the migrations above) and a local Next.js server; needs `E2E_BASE_URL` and
  `E2E_SUPABASE_SERVICE_ROLE_KEY`. The seed script refuses non-localhost URLs.
- `node scripts/e2e/inbox-switch-profile.mjs` — measures conversation
  switching (timings, requests, realtime rejoins, peak-hour traffic).
