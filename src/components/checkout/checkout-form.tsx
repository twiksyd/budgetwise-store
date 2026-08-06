"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useCartStore } from "@/stores/cart-store";

export function CheckoutForm() {
  const router = useRouter();
  const items = useCartStore((state) => state.items);
  const nameInputRef = useRef<HTMLInputElement>(null);

  const [name, setName] = useState("");
  const [robloxUsername, setRobloxUsername] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Focused after a beat so it lands once the page transition from the cart
  // drawer has settled, rather than yanking focus (and the keyboard, on
  // mobile) mid-navigation.
  useEffect(() => {
    const timer = setTimeout(() => nameInputRef.current?.focus(), 300);
    return () => clearTimeout(timer);
  }, []);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
      const response = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: items.map((item) => ({
            gamepassId: item.gamepassId,
            quantity: item.quantity,
          })),
          contact: { name, robloxUsername },
        }),
      });

      if (!response.ok) {
        const body = await response.json().catch(() => null);
        if (response.status === 409) {
          setError(
            "One or more items in your cart are no longer available. Please review your cart and try again.",
          );
        } else {
          setError(body?.error ?? "Something went wrong. Please try again.");
        }
        return;
      }

      const { orderNumber } = await response.json();
      // The cart is cleared on the success page itself, not here. Clearing it
      // while still on /checkout would race against navigation away.
      router.push(`/checkout/success/${orderNumber}`);
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-6">
      <h2 className="font-heading text-sm font-semibold">Details</h2>

      <div className="flex flex-col gap-2">
        <Label htmlFor="name">Facebook Name</Label>
        <Input
          id="name"
          ref={nameInputRef}
          className="h-11"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Exact Facebook Name"
          required
          maxLength={80}
        />
        <p className="text-muted-foreground text-xs leading-relaxed">
          Ilagay ang exact name na ginagamit ninyo sa Facebook account na
          ipangme-message sa amin.
        </p>
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="robloxUsername">Roblox Username</Label>
        <Input
          id="robloxUsername"
          className="h-11"
          value={robloxUsername}
          onChange={(e) => setRobloxUsername(e.target.value)}
          placeholder="Exact Roblox Username"
          required
          maxLength={50}
        />
        <p className="text-muted-foreground text-xs leading-relaxed">
          Ilagay ang exact Roblox username ninyo. Huwag po ang Display Name.
        </p>
      </div>

      {error && <p className="text-destructive text-sm">{error}</p>}

      <div className="bg-amber-500/10 text-amber-950 dark:text-amber-100 border-amber-500/20 rounded-xl border p-3.5">
        <div className="flex gap-2.5">
          <ShieldAlert className="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-300" />
          <div>
            <p className="text-sm font-semibold leading-relaxed">
              Hindi pa po masesend sa amin ang order pagkatapos nito.
            </p>
            <p className="mt-1 text-xs leading-relaxed">
              Kailangan pa ninyong i-send ang buong order message through
              Messenger.
            </p>
          </div>
        </div>
      </div>

      <Button
        type="submit"
        size="lg"
        className="h-11"
        disabled={isSubmitting || items.length === 0}
      >
        {isSubmitting ? "Gumagawa ng Order Slip..." : "Gumawa ng Order Slip"}
      </Button>
      <div className="-mt-3">
        <p className="text-muted-foreground text-center text-xs">
          Wala pa pong kailangang bayaran dito.
        </p>
      </div>
    </form>
  );
}
