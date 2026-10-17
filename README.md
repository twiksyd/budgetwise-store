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
