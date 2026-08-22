import { Separator } from "@/components/ui/separator";
import { Price } from "@/components/shared/price";
import { isRobuxPlusGame, robuxPlusPresentation } from "@/config/robux-products";
import type { CartItem } from "@/types/domain";

export function OrderSummary({
  items,
  subtotal,
}: {
  items: CartItem[];
  subtotal: number;
}) {
  const hasRobuxPlus = items.some((item) => isRobuxPlusGame(item.gameId));

  return (
    <div className="surface-premium rounded-2xl p-6 sm:p-7">
      <h2 className="font-heading text-sm font-semibold">Order summary</h2>
      {hasRobuxPlus && (
        <div className="border-red-500/25 bg-red-500/10 text-red-950 dark:text-red-100 mt-3 rounded-2xl border px-3.5 py-3 text-xs leading-relaxed">
          <p className="text-[11px] font-black tracking-[0.16em] text-red-700 uppercase dark:text-red-300">
            {robuxPlusPresentation.badge} - ROBUX VIA PLUS
          </p>
          <p className="font-heading mt-1 text-2xl font-black tracking-tight">
            1-8 HOURS
          </p>
          <p className="mt-1 font-medium">
            Applies only to the Via Plus portion of this order after confirmed
            payment.
          </p>
          <p className="mt-2 opacity-90">
            If not delivered within 8 hours after confirmed payment, the
            affected Via Plus order will be refunded.
          </p>
        </div>
      )}
      <div className="mt-5 flex flex-col gap-3.5">
        {items.map((item) => (
          <div key={item.gamepassId} className="flex justify-between gap-3 text-sm">
            <div className="min-w-0">
              <p className="truncate">{item.name}</p>
              <p className="text-muted-foreground text-xs">
                {item.gameName} · Qty {item.quantity}
              </p>
            </div>
            <Price
              amount={item.price * item.quantity}
              variant="line"
              className="shrink-0 text-foreground"
            />
          </div>
        ))}
      </div>
      <Separator className="my-5" />
      <div className="flex justify-between text-sm">
        <span className="text-muted-foreground">Total</span>
        <Price amount={subtotal} variant="cart" className="text-foreground" />
      </div>
    </div>
  );
}
