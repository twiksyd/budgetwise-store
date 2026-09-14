"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { isRobuxPlusGame } from "@/config/robux-products";
import { useCartStore } from "@/stores/cart-store";
import { writePendingOrderClear } from "@/lib/pending-order-clear";
import { findCartLimitViolations } from "@/lib/cart-limits";
import {
  MAX_DISTINCT_ORDER_ITEMS,
  MAX_QUANTITY_PER_PRODUCT,
} from "@/lib/validations/order";
import {
  buildCheckoutSignature,
  clearCheckoutAttempt,
  resolveCheckoutAttempt,
} from "@/lib/checkout-attempt";

const CONTROL_CHARACTER_RE = /[\x00-\x1f\x7f]/;

type ViaPlusErrors = {
  robloxDisplayName?: string;
  age16Confirmed?: string;
  verifiedAccountConfirmed?: string;
};

export function CheckoutForm() {
  const router = useRouter();
  const items = useCartStore((state) => state.items);
  const removeItem = useCartStore((state) => state.removeItem);
  const nameInputRef = useRef<HTMLInputElement>(null);
  const robloxDisplayNameRef = useRef<HTMLInputElement>(null);
  const age16Ref = useRef<HTMLInputElement>(null);
  const verifiedAccountRef = useRef<HTMLInputElement>(null);
  const errorRegionRef = useRef<HTMLDivElement>(null);
  // Mirrors `isSubmitting` but reads/writes synchronously, so two submit
  // events fired in the same tick (double Enter, a fast double-tap) can't
  // both slip past the disabled-button check before React re-renders.
  const isSubmittingRef = useRef(false);
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
  const [unavailableGamepassIds, setUnavailableGamepassIds] = useState<
    string[] | null
  >(null);

  const unavailableItems = unavailableGamepassIds
    ? items.filter((item) => unavailableGamepassIds.includes(item.gamepassId))
    : [];

  // A cart persisted from before these caps existed (or before a cap was
  // lowered) can already violate them. The server still enforces the same
  // limits (see src/lib/validations/order.ts) — this just catches it here
  // first so the customer gets a friendly, named message instead of a raw
  // schema error from the API.
  const cartLimitViolations = useMemo(
    () => findCartLimitViolations(items),
    [items],
  );

  // Focused after a beat so it lands once the page transition from the cart
  // drawer has settled, rather than yanking focus (and the keyboard, on
  // mobile) mid-navigation.
  useEffect(() => {
    const timer = setTimeout(() => nameInputRef.current?.focus(), 300);
    return () => clearTimeout(timer);
  }, []);

  // Once the customer removes (or otherwise loses) every affected item, the
  // recovery banner has nothing left to say — drop it instead of leaving a
  // stale error on screen.
  useEffect(() => {
    if (!unavailableGamepassIds) return;
    if (unavailableItems.length === 0) setUnavailableGamepassIds(null);
  }, [unavailableGamepassIds, unavailableItems.length]);

  // Move focus to whichever error just appeared so screen reader users land
  // on it immediately instead of having to discover it silently.
  useEffect(() => {
    if (error || unavailableItems.length > 0 || cartLimitViolations.hasViolations) {
      errorRegionRef.current?.focus();
    }
  }, [error, unavailableItems.length, cartLimitViolations.hasViolations]);

  function handleRemoveUnavailableItems() {
    if (!unavailableGamepassIds) return;
    for (const gamepassId of unavailableGamepassIds) {
      removeItem(gamepassId);
    }
    setUnavailableGamepassIds(null);
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (isSubmittingRef.current) return;
    // Defense in depth: the submit button is already disabled while this is
    // true, but a disabled button doesn't stop an Enter-key form submit in
    // every browser.
    if (cartLimitViolations.hasViolations) {
      errorRegionRef.current?.focus();
      return;
    }

    setError(null);
    setUnavailableGamepassIds(null);
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
        if (nextViaPlusErrors.robloxDisplayName) {
          robloxDisplayNameRef.current?.focus();
        } else if (nextViaPlusErrors.age16Confirmed) {
          age16Ref.current?.focus();
        } else if (nextViaPlusErrors.verifiedAccountConfirmed) {
          verifiedAccountRef.current?.focus();
        }
        return;
      }
    }

    isSubmittingRef.current = true;
    setIsSubmitting(true);

    try {
      const submittedItems = items.map((item) => ({
        gamepassId: item.gamepassId,
        quantity: item.quantity,
      }));
      const viaPlusDetails = hasViaPlus
        ? {
            robloxDisplayName,
            age16Confirmed,
            verifiedAccountConfirmed,
          }
        : undefined;

      // Both credentials are generated once per checkout attempt and reused
      // by every retry of it: the idempotency key so the server resolves a
      // retry to the order the first attempt already created, and the view
      // token so the success URL still opens that order.
      const attempt = resolveCheckoutAttempt(
        buildCheckoutSignature({
          items: submittedItems,
          contact: { name, robloxUsername },
          viaPlus: viaPlusDetails,
        }),
      );

      const response = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: submittedItems,
          contact: { name, robloxUsername },
          viaPlus: viaPlusDetails,
          idempotencyKey: attempt.idempotencyKey,
          viewToken: attempt.viewToken,
        }),
      });

      if (!response.ok) {
        const body = await response.json().catch(() => null);
        if (
          response.status === 409 &&
          Array.isArray(body?.unavailableGamepassIds)
        ) {
          setUnavailableGamepassIds(body.unavailableGamepassIds);
        } else {
          setError(body?.error ?? "Something went wrong. Please try again.");
        }
        isSubmittingRef.current = false;
        setIsSubmitting(false);
        return;
      }

      const { orderNumber } = await response.json();
      // This attempt is done: a later checkout of the same items is a new
      // order, not a replay of this one.
      clearCheckoutAttempt();
      // Record exactly which items/quantities this order covers so the
      // success page clears only those, once — see clear-cart-on-success.
      writePendingOrderClear(orderNumber, submittedItems);
      // The cart is cleared on the success page itself, not here. Clearing it
      // while still on /checkout would race against navigation away.
      // The order number names the order; the token is what authorises
      // viewing it, so the slip URL carries both.
      router.push(
        `/checkout/success/${encodeURIComponent(orderNumber)}?t=${encodeURIComponent(attempt.viewToken)}`,
      );
      // isSubmitting intentionally stays true here: the order already
      // exists server-side, so the button must stay locked until the
      // navigation above actually lands, not reset while it's in flight.
    } catch {
      setError("Something went wrong. Please try again.");
      isSubmittingRef.current = false;
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
              ref={robloxDisplayNameRef}
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
                ref={age16Ref}
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
                ref={verifiedAccountRef}
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

      {cartLimitViolations.hasViolations ? (
        <div
          ref={errorRegionRef}
          tabIndex={-1}
          role="alert"
          aria-live="assertive"
          className="border-destructive/30 bg-destructive/5 rounded-xl border p-3.5 text-sm outline-none"
        >
          <p className="text-destructive font-semibold">
            Please fix your cart before continuing:
          </p>
          <ul className="text-destructive/90 mt-2 list-disc space-y-1 pl-5">
            {cartLimitViolations.overQuantityItems.map((item) => (
              <li key={item.gamepassId}>
                {item.name} has a quantity of {item.quantity}. Maximum is{" "}
                {MAX_QUANTITY_PER_PRODUCT} per item. Please reduce the
                quantity in your cart before continuing.
              </li>
            ))}
            {cartLimitViolations.overDistinctProducts && (
              <li>
                Your cart has {items.length} different products. Maximum is{" "}
                {MAX_DISTINCT_ORDER_ITEMS} per order. Please remove{" "}
                {cartLimitViolations.excessProductCount} item
                {cartLimitViolations.excessProductCount === 1 ? "" : "s"}{" "}
                before continuing.
              </li>
            )}
          </ul>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => router.push("/cart")}
            >
              Balikan ang Cart
            </Button>
          </div>
        </div>
      ) : unavailableItems.length > 0 ? (
        <div
          ref={errorRegionRef}
          tabIndex={-1}
          role="alert"
          aria-live="assertive"
          className="border-destructive/30 bg-destructive/5 rounded-xl border p-3.5 text-sm outline-none"
        >
          <p className="text-destructive font-semibold">
            {unavailableItems.length === 1
              ? "1 item sa cart ninyo ay hindi na available:"
              : `${unavailableItems.length} items sa cart ninyo ay hindi na available:`}
          </p>
          <ul className="text-destructive/90 mt-2 list-disc space-y-1 pl-5">
            {unavailableItems.map((item) => (
              <li key={item.gamepassId}>
                {item.name} — {item.gameName}
              </li>
            ))}
          </ul>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button
              type="button"
              variant="destructive"
              size="sm"
              onClick={handleRemoveUnavailableItems}
            >
              Alisin ang mga item na ito
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => router.push("/cart")}
            >
              Balikan ang Cart
            </Button>
          </div>
        </div>
      ) : (
        error && (
          <p
            ref={errorRegionRef}
            tabIndex={-1}
            role="alert"
            aria-live="assertive"
            className="text-destructive text-sm outline-none"
          >
            {error}
          </p>
        )
      )}

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
        disabled={
          isSubmitting || items.length === 0 || cartLimitViolations.hasViolations
        }
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
