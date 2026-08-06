import { Separator } from "@/components/ui/separator";
import { Price } from "@/components/shared/price";
import type { CartItem } from "@/types/domain";

export function OrderSummary({
  items,
  subtotal,
}: {
  items: CartItem[];
  subtotal: number;
}) {
  return (
    <div className="surface-premium rounded-2xl p-6 sm:p-7">
      <h2 className="font-heading text-sm font-semibold">Order summary</h2>
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
