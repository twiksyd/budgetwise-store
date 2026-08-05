"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useCartStore } from "@/stores/cart-store";

export function CheckoutForm() {
  const router = useRouter();
  const items = useCartStore((state) => state.items);
  const clearCart = useCartStore((state) => state.clear);

  const [name, setName] = useState("");
  const [robloxUsername, setRobloxUsername] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
      clearCart();
      router.push(`/checkout/success/${orderNumber}`);
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <Label htmlFor="name">Your name</Label>
        <Input
          id="name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="How should we address you?"
          required
          maxLength={100}
        />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="robloxUsername">Roblox username</Label>
        <Input
          id="robloxUsername"
          value={robloxUsername}
          onChange={(e) => setRobloxUsername(e.target.value)}
          placeholder="Where we'll deliver your order"
          required
          maxLength={50}
        />
      </div>

      {error && <p className="text-destructive text-sm">{error}</p>}

      <Button
        type="submit"
        size="lg"
        disabled={isSubmitting || items.length === 0}
      >
        {isSubmitting ? "Placing order..." : "Place order"}
      </Button>
    </form>
  );
}
