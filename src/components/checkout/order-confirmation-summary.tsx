import { Separator } from "@/components/ui/separator";
import { formatPrice } from "@/lib/pricing";
import type { OrderConfirmation } from "@/lib/queries/orders";

export function OrderConfirmationSummary({
  order,
}: {
  order: OrderConfirmation;
}) {
  return (
    <div className="surface-premium rounded-2xl p-6 sm:p-7">
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-heading text-sm font-semibold">Order summary</h2>
        <p className="text-muted-foreground truncate text-xs">
          Deliver to <span className="text-foreground font-medium">{order.buyerRobloxUsername}</span>
        </p>
      </div>

      <div className="mt-5 flex flex-col gap-3.5">
        {order.lines.map((line) => (
          <div
            key={line.gamepassId}
            className="flex items-center justify-between gap-3 text-sm"
          >
            <div className="min-w-0">
              <p className="truncate font-medium">{line.gamepassName}</p>
              <p className="text-muted-foreground text-xs">
                {line.robuxAmount.toLocaleString()} Robux
              </p>
            </div>
            <p className="shrink-0 font-medium [font-variant-numeric:tabular-nums]">
              {formatPrice(line.sellingPrice)}
            </p>
          </div>
        ))}
      </div>

      <Separator className="my-5" />

      <div className="flex items-center justify-between">
        <span className="text-muted-foreground text-sm">Total</span>
        <span className="font-heading text-primary text-xl font-bold [font-variant-numeric:tabular-nums]">
          {formatPrice(order.total)}
        </span>
      </div>
    </div>
  );
}
