import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import {
  ChevronRight,
  MessageCircle,
  PackageCheck,
  ShieldCheck,
  ShieldQuestion,
} from "lucide-react";
import { GamepassCard } from "@/components/catalog/gamepass-card";
import { Badge } from "@/components/ui/badge";
import { robuxViaLinkGameIds, robuxViaLinkTile } from "@/config/robux-via-link";
import { getGamepassesByGameId } from "@/lib/queries/catalog";
import { resolveStoreStatusSafe } from "@/lib/store-status";

export const revalidate = 60;

export const metadata: Metadata = {
  title: robuxViaLinkTile.name,
  description:
    "Buy Robux via link — choose whether Roblox's marketplace tax is covered for you or not.",
};

// Not backed by a single `games` row — this merges two live inventory games
// (Robux Sell — Covered Tax / Robux Sell — No Tax) into one page with two
// sections, so customers pick a tax option once instead of finding two
// near-identical game cards in the catalog. See config/robux-via-link.ts.
export default async function RobuxViaLinkPage() {
  const [coveredTax, notCoveredTax, { status: storeStatus }] = await Promise.all([
    getGamepassesByGameId(robuxViaLinkGameIds.coveredTax),
    getGamepassesByGameId(robuxViaLinkGameIds.notCoveredTax),
    resolveStoreStatusSafe(),
  ]);

  const orderingDisabled = storeStatus !== "open";

  return (
    <div className="mx-auto max-w-5xl px-6 py-10 sm:py-16">
      <nav className="text-muted-foreground flex items-center gap-1.5 text-sm">
        <Link href="/games" className="hover:text-foreground transition-colors">
          Games
        </Link>
        <ChevronRight className="size-3.5" />
        <span className="text-foreground">{robuxViaLinkTile.name}</span>
      </nav>

      <div className="mt-6 flex items-center gap-5">
        <div
          className="surface-premium relative flex size-24 shrink-0 items-center justify-center overflow-hidden rounded-3xl sm:size-32"
          style={{ backgroundColor: `${robuxViaLinkTile.color}1a` }}
        >
          <Image
            src={robuxViaLinkTile.iconUrl}
            alt={robuxViaLinkTile.name}
            fill
            sizes="(min-width: 640px) 128px, 96px"
            className="object-cover"
          />
        </div>
        <div className="min-w-0">
          <p className="text-muted-foreground text-xs font-medium">
            Direct Sale / {coveredTax.length + notCoveredTax.length} products available
          </p>
          <h1 className="font-heading mt-2 text-3xl font-semibold tracking-tight text-balance sm:text-5xl">
            {robuxViaLinkTile.name}
          </h1>
          <p className="text-muted-foreground mt-3 max-w-2xl text-[15px] leading-relaxed sm:text-base">
            Choose a Robux amount, then confirm the order with a real
            BudgetWise representative on Messenger before payment.
          </p>
        </div>
      </div>

      <div className="mt-6 grid gap-2 sm:grid-cols-3">
        <span className="surface-premium inline-flex items-center gap-2 rounded-2xl px-3.5 py-3 text-xs font-medium">
          <ShieldCheck className="size-3.5" />
          No payment on this website
        </span>
        <span className="surface-premium inline-flex items-center gap-2 rounded-2xl px-3.5 py-3 text-xs font-medium">
          <MessageCircle className="size-3.5" />
          Messenger confirmation required
        </span>
        <span className="surface-premium inline-flex items-center gap-2 rounded-2xl px-3.5 py-3 text-xs font-medium">
          <PackageCheck className="size-3.5" />
          Delivered to your Roblox username
        </span>
      </div>

      {/* Explains the two sections before the customer has to guess which
          one applies to them — the whole point of merging these into one
          page instead of two confusingly-similar game cards. */}
      <div className="surface-premium mt-8 grid gap-6 rounded-2xl p-6 sm:grid-cols-2">
        <div>
          <div className="flex items-center gap-2">
            <ShieldCheck className="text-primary size-4" />
            <h2 className="font-heading text-sm font-semibold">Tax Covered</h2>
          </div>
          <p className="text-muted-foreground mt-2 text-sm leading-relaxed">
            The listed Robux amount is exactly what you receive —
            BudgetWise covers Roblox&apos;s marketplace tax for you.
          </p>
        </div>
        <div className="border-border/60 sm:border-l sm:pl-6">
          <div className="flex items-center gap-2">
            <ShieldQuestion className="text-muted-foreground size-4" />
            <h2 className="font-heading text-sm font-semibold">Tax Not Covered</h2>
          </div>
          <p className="text-muted-foreground mt-2 text-sm leading-relaxed">
            Roblox deducts a 30% marketplace tax. For example, purchasing{" "}
            <span className="text-foreground font-medium">1,000 Robux</span>{" "}
            nets your account{" "}
            <span className="text-foreground font-medium">700 Robux</span>.
          </p>
        </div>
      </div>

      <div className="mt-10 flex flex-col gap-10 sm:mt-12 sm:gap-14">
        <section>
          <div className="flex items-start justify-between gap-4">
            <div className="flex min-w-0 items-start gap-3">
              <div className="bg-primary/10 flex size-10 shrink-0 items-center justify-center rounded-2xl">
                <ShieldCheck className="text-primary size-5" />
              </div>
              <div className="min-w-0">
                <h2 className="font-heading text-2xl font-semibold tracking-tight sm:text-3xl">
                  Tax Covered
                </h2>
                <Badge variant="secondary" className="mt-1.5">
                  Recommended
                </Badge>
                <p className="text-muted-foreground mt-1.5 text-sm leading-relaxed">
                  Choose an amount where the listed Robux is what you receive.
                </p>
              </div>
            </div>
            <p className="bg-muted text-muted-foreground shrink-0 rounded-full px-3 py-1 text-xs font-medium">
              {coveredTax.length} option{coveredTax.length === 1 ? "" : "s"}
            </p>
          </div>

          <div className="mt-5 grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-3">
            {coveredTax.map((gamepass) => (
              <GamepassCard
                key={gamepass.id}
                gamepass={gamepass}
                gameId={robuxViaLinkGameIds.coveredTax}
                gameSlug={robuxViaLinkTile.slug}
                gameName={robuxViaLinkTile.name}
                gameIconUrl={robuxViaLinkTile.iconUrl}
                category="currency"
                orderingDisabled={orderingDisabled}
              />
            ))}
          </div>
        </section>

        <section className="border-border/60 border-t pt-10">
          <div className="flex items-start justify-between gap-4">
            <div className="flex min-w-0 items-start gap-3">
              <div className="bg-primary/10 flex size-10 shrink-0 items-center justify-center rounded-2xl">
                <ShieldQuestion className="text-primary size-5" />
              </div>
              <div className="min-w-0">
                <h2 className="font-heading text-2xl font-semibold tracking-tight sm:text-3xl">
                  Tax Not Covered
                </h2>
                <p className="text-muted-foreground mt-1.5 text-sm leading-relaxed">
                  Choose a lower-price amount where Roblox deducts its tax.
                </p>
              </div>
            </div>
            <p className="bg-muted text-muted-foreground shrink-0 rounded-full px-3 py-1 text-xs font-medium">
              {notCoveredTax.length} option{notCoveredTax.length === 1 ? "" : "s"}
            </p>
          </div>

          <div className="mt-5 grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-3">
            {notCoveredTax.map((gamepass) => (
              <GamepassCard
                key={gamepass.id}
                gamepass={gamepass}
                gameId={robuxViaLinkGameIds.notCoveredTax}
                gameSlug={robuxViaLinkTile.slug}
                gameName={robuxViaLinkTile.name}
                gameIconUrl={robuxViaLinkTile.iconUrl}
                category="currency"
                orderingDisabled={orderingDisabled}
              />
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
