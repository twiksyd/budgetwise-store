"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { isRobuxPlusGame } from "@/config/robux-products";
import { useCartStore } from "@/stores/cart-store";

const CONTROL_CHARACTER_RE = /[\x00-\x1f\x7f]/;

type ViaPlusErrors = {
  robloxDisplayName?: string;
  age16Confirmed?: string;
  verifiedAccountConfirmed?: string;
};

export function CheckoutForm() {
  const router = useRouter();
  const items = useCartStore((state) => state.items);
  const nameInputRef = useRef<HTMLInputElement>(null);
  const hasViaPlus = items.some((item) => isRobuxPlusGame(item.gameId));
  const viaPlusRobuxAmount = items.reduce(
    (sum, item) =>
      isRobuxPlusGame(item.gameId)
        ? sum + item.robuxAmount * item.quantity
        : sum,
    0,
  );

  const [name, setName] = useState("");
  const [robloxUsername, setRobloxUsername] = useState("");
  const [robloxDisplayName, setRobloxDisplayName] = useState("");
  const [age16Confirmed, setAge16Confirmed] = useState(false);
  const [verifiedAccountConfirmed, setVerifiedAccountConfirmed] =
    useState(false);
  const [viaPlusErrors, setViaPlusErrors] = useState<ViaPlusErrors>({});
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
    setViaPlusErrors({});

    if (hasViaPlus) {
      const nextViaPlusErrors: ViaPlusErrors = {};
      const trimmedDisplayName = robloxDisplayName.trim();

      if (!trimmedDisplayName) {
        nextViaPlusErrors.robloxDisplayName =
          "Enter your Roblox Display Name for Via Plus.";
      } else if (trimmedDisplayName.length > 80) {
        nextViaPlusErrors.robloxDisplayName =
          "Roblox Display Name must be 80 characters or fewer.";
      } else if (CONTROL_CHARACTER_RE.test(trimmedDisplayName)) {
        nextViaPlusErrors.robloxDisplayName =
          "Roblox Display Name contains unsupported characters.";
      }

      if (!age16Confirmed) {
        nextViaPlusErrors.age16Confirmed =
          "Confirm that your Roblox account is age 16+.";
      }

      if (!verifiedAccountConfirmed) {
        nextViaPlusErrors.verifiedAccountConfirmed =
          "Confirm that your Roblox account is verified.";
      }

      if (Object.keys(nextViaPlusErrors).length > 0) {
        setViaPlusErrors(nextViaPlusErrors);
        return;
      }
    }

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
          viaPlus: hasViaPlus
            ? {
                robloxDisplayName,
                age16Confirmed,
                verifiedAccountConfirmed,
              }
            : undefined,
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

      {hasViaPlus && (
        <section className="border-primary/20 bg-primary/5 rounded-2xl border p-4">
          <div>
            <p className="text-primary text-xs font-semibold tracking-wide uppercase">
              Via Plus Pre-Order
            </p>
            <h3 className="font-heading mt-1 text-base font-semibold">
              Via Plus Account Requirements
            </h3>
            <p className="text-muted-foreground mt-1 text-xs leading-relaxed">
              These apply only to the Via Plus portion of your order.
            </p>
          </div>

          <div className="bg-background/70 border-border mt-4 rounded-xl border p-3">
            <p className="text-muted-foreground text-xs font-medium">
              Order Amount
            </p>
            <p className="font-heading mt-1 text-xl font-semibold tracking-tight">
              {viaPlusRobuxAmount.toLocaleString()} Robux
            </p>
            <p className="text-muted-foreground mt-1 text-xs leading-relaxed">
              Automatically calculated from your Via Plus items.
            </p>
          </div>

          <div className="mt-4 flex flex-col gap-2">
            <Label htmlFor="robloxDisplayName">Roblox Display Name</Label>
            <Input
              id="robloxDisplayName"
              className="h-11"
              value={robloxDisplayName}
              onChange={(e) => setRobloxDisplayName(e.target.value)}
              placeholder="Exact Roblox Display Name"
              required={hasViaPlus}
              maxLength={80}
              aria-invalid={Boolean(viaPlusErrors.robloxDisplayName)}
              aria-describedby={
                viaPlusErrors.robloxDisplayName
                  ? "robloxDisplayName-error"
                  : "robloxDisplayName-help"
              }
            />
            {viaPlusErrors.robloxDisplayName ? (
              <p
                id="robloxDisplayName-error"
                className="text-destructive text-xs leading-relaxed"
              >
                {viaPlusErrors.robloxDisplayName}
              </p>
            ) : (
              <p
                id="robloxDisplayName-help"
                className="text-muted-foreground text-xs leading-relaxed"
              >
                Your Roblox display name, not your username.
              </p>
            )}
          </div>

          <div className="mt-4 space-y-3">
            <label className="flex gap-3 text-sm leading-relaxed">
              <input
                type="checkbox"
                checked={age16Confirmed}
                onChange={(event) =>
                  setAge16Confirmed(event.currentTarget.checked)
                }
                className="mt-1 size-4 shrink-0 accent-primary"
              />
              <span>My Roblox account is age 16+</span>
            </label>
            {viaPlusErrors.age16Confirmed && (
              <p className="text-destructive -mt-1 pl-7 text-xs leading-relaxed">
                {viaPlusErrors.age16Confirmed}
              </p>
            )}

            <label className="flex gap-3 text-sm leading-relaxed">
              <input
                type="checkbox"
                checked={verifiedAccountConfirmed}
                onChange={(event) =>
                  setVerifiedAccountConfirmed(event.currentTarget.checked)
                }
                className="mt-1 size-4 shrink-0 accent-primary"
              />
              <span>My Roblox account is verified</span>
            </label>
            {viaPlusErrors.verifiedAccountConfirmed && (
              <p className="text-destructive -mt-1 pl-7 text-xs leading-relaxed">
                {viaPlusErrors.verifiedAccountConfirmed}
              </p>
            )}
          </div>
        </section>
      )}

      {error && <p className="text-destructive text-sm">{error}</p>}

      <div className="bg-amber-500/10 text-amber-950 dark:text-amber-100 border-amber-500/20 rounded-xl border px-3 py-2.5">
        <div className="flex gap-2.5">
          <ShieldAlert className="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-300" />
          <div>
            <p className="text-[11px] font-semibold tracking-wide uppercase">
              Next step
            </p>
            <p className="mt-0.5 text-xs leading-relaxed">
              Hindi pa po mase-send sa amin ang order pagkatapos nito. Ipapadala
              pa ninyo ang buong Order Message sa Messenger.
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
