import Link from "next/link";
import { Button } from "@/components/ui/button";
import { formatPrice } from "@/lib/pricing";

export function CartSummary({ subtotal }: { subtotal: number }) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between text-sm">
        <span className="text-muted-foreground">Subtotal</span>
        <span className="font-semibold">{formatPrice(subtotal)}</span>
      </div>
      <Button asChild size="lg">
        <Link href="/checkout">Checkout</Link>
      </Button>
    </div>
  );
}
