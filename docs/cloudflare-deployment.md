# Cloudflare Workers deployment

The Cloudflare deployment is isolated from the existing Vercel setup. Vercel continues to use `pnpm build`; the Cloudflare-only image setting is applied only by `pnpm build:cloudflare`.

## Compatibility and free-tier assessment

- This branch uses Next.js 15.5.29 with `@opennextjs/cloudflare` 1.20.17. The adapter supports Next 15.5.29+ and Next 16.4.5+.
- OpenNext supports App Router, route handlers, Node middleware, SSR, ISR, and Server Actions. `wrangler.jsonc` is staging-only and enables `workers.dev`; it contains no production hostname.
- This app has dynamic order/API routes, Supabase Auth, server-rendered admin routes, and a Realtime inbox. The browser's Supabase Realtime connection goes directly to Supabase, while its inbox and chat HTTP APIs invoke the Worker.
- Workers Free allows 100,000 Worker invocations per day, 10 ms CPU per invocation, 128 MB memory and 50 subrequests per invocation. Requests served as static assets are free and unlimited; requests invoking SSR, route handlers, or middleware count against the Worker limits. Cloudflare says SSR/auth workloads commonly take 10–20 ms CPU, so the free CPU limit is a concern for dynamic checkout and inbox paths. The free daily request limit also depends on the share of storefront views that invoke the Worker. Real headroom cannot be estimated without traffic and deployed CPU measurements.
- Cloudflare's current Worker bundle limit is 64 MiB uncompressed on both Free and Paid plans. OpenNext's older size note is out of date; Wrangler's deploy dry run reports the current bundle size.

## Staging setup and test plan

OpenNext warns that its build toolchain is not fully compatible with Windows. The `cloudflare-staging.yml` workflow uses GitHub's Linux runner and runs only on the `codex/cloudflare-open-next-current` branch.

Before the workflow can deploy, add these repository **secrets** under GitHub Settings → Secrets and variables → Actions. Use only staging project values:

- `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`
- `STAGING_SUPABASE_URL`, `STAGING_SUPABASE_ANON_KEY`, and `STAGING_SUPABASE_SERVICE_ROLE_KEY`
- `STAGING_ADMIN_EMAIL`, `STAGING_ADMIN_PASSWORD`, and `STAGING_SMOKE_ORDER_NUMBER` for a staging-only admin and test conversation

The workflow deliberately does not read the repository's existing `NEXT_PUBLIC_SUPABASE_URL` or `SUPABASE_SERVICE_ROLE_KEY` secrets. If a staging secret is missing, the workflow skips deployment and lists only the missing names.

After secrets are configured, rerun the branch's Cloudflare staging workflow. It installs dependencies on Ubuntu, runs the order/chat unit suites, builds with staging Supabase credentials, creates the dedicated R2 bucket if needed, deploys only `budgetwise-store-staging` to `workers.dev`, sets only staging secrets on that Worker, and runs `scripts/smoke-cloudflare-staging.mjs`.

The smoke check reads `/`, `/games`, a live `/games/<slug>` route, `/games/robux-via-link`, `/checkout`, `/api/reviews`, a malformed (non-writing) order request, image URLs, unauthenticated account/admin APIs, and an authenticated admin inbox/chat. It waits for the Realtime `Live` status and reads one staging conversation. It does not send a chat message or create an order.

After representative requests, record Worker invocation counts and p50/p95/max CPU from Cloudflare Worker observability. Check for CPU-limit errors, failed Realtime subscriptions, API exceptions, image failures, and ISR revalidation behavior. Do not infer free-tier headroom from a short test alone; compare staging traffic and CPU against projected real daily invocations.

The R2 bucket and Durable Object queue in this config are staging-only and keep the app's 60-second ISR cache behavior. The Durable Object class migration is only for this new staging Worker. Do not run Supabase SQL or Supabase migrations as part of this deployment.

## Production cutover and rollback

Do not attach the production hostname until staging checks pass, Cloudflare metrics are reviewed, and DNS rollback values are saved.

1. In Cloudflare DNS, export the zone file. Separately save every record for `budgetwiseshop.com` and `www.budgetwiseshop.com`, including name, type, target/content, proxy status, TTL, and comments. Save relevant CAA records and any hostname-specific redirects or rules. Keep the Vercel project and its deployment/domain configuration intact.
2. Deploy a separately named production Worker and a separate production cache bucket. Verify its `workers.dev` preview. Then attach the production hostnames using Cloudflare Workers custom domains; do not replace unrelated zone records.
3. To roll back, detach the custom domain(s) from the Worker and restore the saved apex and `www` DNS records exactly, including proxy status and TTL. Remove only records/rules created for the Worker and restore any altered CAA/redirect entries from the saved export. Verify Vercel answers on both hostnames.

This staging setup does not change DNS, the Vercel project, Supabase schema/data, or production Realtime/XOB behavior.
