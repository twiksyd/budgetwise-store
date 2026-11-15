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

The workflow has two gates. The Linux build and unit tests run on every branch push without credentials, using the local read-only mock for both public and admin reads. The deploy gate uses the production anon key for catalog reads during static generation, while server-side admin lookups stay on the local mock to avoid store-status writes. The automated authenticated smoke test is disabled for this production-backed preview.

The temporary preview Worker uses the existing production Supabase project. The required GitHub Actions secrets are:

- `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`
- `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` (already configured in this repository)
- `PREVIEW_SUPABASE_ANON_KEY` (the production project's public anon key)

The service-role key is present on the Worker only for its existing server-side app behavior. Treat this preview URL as production-connected: signed-in admin operations, checkout writes, and chat sends can affect live data. Do not use it to create test orders or send test messages. Automated authenticated, checkout, and chat requests are intentionally not sent.

The workflow uses the existing production URL and service-role repository secrets only in the deploy gate. It never reads them in the credential-free Linux build/unit-test gate. If Cloudflare or the anon-key secret is missing, deploy is skipped while build/tests still run.

After `PREVIEW_SUPABASE_ANON_KEY` is configured, rerun the branch workflow. The deploy gate installs dependencies on Ubuntu, builds with production catalog reads and a read-only mock for status/admin lookups during prerender, creates the dedicated R2 bucket if needed, deploys only `budgetwise-store-staging` to `workers.dev`, and sets the production Supabase credentials on that temporary Worker.

No automated requests are sent to the production-backed Worker. The existing read-only smoke script remains available for use against a staging project; it must not be run against this production-connected preview because some read flows can advance chat read cursors, and the app exposes live checkout and admin write actions.

After representative requests, record Worker invocation counts and p50/p95/max CPU from Cloudflare Worker observability. Check for CPU-limit errors, failed Realtime subscriptions, API exceptions, image failures, and ISR revalidation behavior. Do not infer free-tier headroom from a short test alone; compare staging traffic and CPU against projected real daily invocations.

The R2 bucket and Durable Object queue in this config are staging-only and keep the app's 60-second ISR cache behavior. The Durable Object class migration is only for this new staging Worker. Do not run Supabase SQL or Supabase migrations as part of this deployment.

## Production cutover and rollback

Do not attach the production hostname until staging checks pass, Cloudflare metrics are reviewed, and DNS rollback values are saved.

1. In Cloudflare DNS, export the zone file. Separately save every record for `budgetwiseshop.com` and `www.budgetwiseshop.com`, including name, type, target/content, proxy status, TTL, and comments. Save relevant CAA records and any hostname-specific redirects or rules. Keep the Vercel project and its deployment/domain configuration intact.
2. Deploy a separately named production Worker and a separate production cache bucket. Verify its `workers.dev` preview. Then attach the production hostnames using Cloudflare Workers custom domains; do not replace unrelated zone records.
3. To roll back, detach the custom domain(s) from the Worker and restore the saved apex and `www` DNS records exactly, including proxy status and TTL. Remove only records/rules created for the Worker and restore any altered CAA/redirect entries from the saved export. Verify Vercel answers on both hostnames.

This preview does not change DNS, the Vercel project, Supabase schema, or production Realtime/XOB behavior. Its public URL is connected to production runtime data and must be handled as a live app.
