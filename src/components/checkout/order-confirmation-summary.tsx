import { Separator } from "@/components/ui/separator";
import { Price } from "@/components/shared/price";
import type { OrderConfirmation } from "@/lib/queries/orders";

export function OrderConfirmationSummary({
  order,
}: {
  order: OrderConfirmation;
}) {
  return (
    <aside className="surface-premium rounded-2xl p-4 sm:p-5 lg:sticky lg:top-24">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h2 className="font-heading text-base font-semibold">
            Order Summary
          </h2>
          <p className="text-muted-foreground mt-1 truncate text-sm">
            Facebook Name:{" "}
            <span className="text-foreground font-medium">
              {order.buyerName}
            </span>
          </p>
          <p className="text-muted-foreground mt-0.5 truncate text-sm">
            Roblox Username:{" "}
            <span className="text-foreground font-medium">
              {order.buyerRobloxUsername}
            </span>
          </p>
        </div>
        <div className="shrink-0 text-right">
          <p className="text-muted-foreground text-xs font-medium">Total</p>
          <Price amount={order.total} variant="summary" />
        </div>
      </div>

      <Separator className="my-4" />

      <div className="flex flex-col gap-3">
        {order.lines.map((line, index) => (
          <div
            key={`${line.gamepassId}-${index}`}
            className="flex items-start justify-between gap-3 text-sm"
          >
            <div className="min-w-0">
              <p className="truncate font-medium">
                {line.quantity > 1 ? `${line.quantity}× ` : ""}
                {line.gamepassName}
              </p>
              <p className="text-muted-foreground mt-0.5 truncate text-xs">
                {line.gameName} · {line.robuxAmount.toLocaleString()} Robux
              </p>
            </div>
            <Price
              amount={line.sellingPrice}
              variant="line"
              className="shrink-0 text-foreground"
            />
          </div>
        ))}
      </div>
    </aside>
  );
}
