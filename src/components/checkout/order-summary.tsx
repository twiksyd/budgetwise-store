import { Separator } from "@/components/ui/separator";
import { formatPrice } from "@/lib/pricing";
import type { CartItem } from "@/types/domain";

export function OrderSummary({
  items,
  subtotal,
}: {
  items: CartItem[];
  subtotal: number;
}) {
  return (
    <div className="bg-card rounded-xl border p-5">
      <h2 className="font-heading text-sm font-semibold">Order summary</h2>
      <div className="mt-4 flex flex-col gap-3">
        {items.map((item) => (
          <div key={item.gamepassId} className="flex justify-between text-sm">
            <div>
              <p>{item.name}</p>
              <p className="text-muted-foreground text-xs">
                {item.gameName} · Qty {item.quantity}
              </p>
            </div>
            <p className="font-medium">
              {formatPrice(item.price * item.quantity)}
            </p>
          </div>
        ))}
      </div>
      <Separator className="my-4" />
      <div className="flex justify-between text-sm font-semibold">
        <span>Total</span>
        <span>{formatPrice(subtotal)}</span>
      </div>
    </div>
  );
}
