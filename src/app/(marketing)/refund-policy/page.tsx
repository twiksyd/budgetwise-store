import type { Metadata } from "next";
import Link from "next/link";
import { CheckCircle2, XCircle } from "lucide-react";
import { Taglish } from "@/components/shared/taglish";

export const metadata: Metadata = {
  title: "Refund & order policy",
  description: "When refunds apply, and how order processing works.",
};

const eligible = [
  "Payment was confirmed but the order was never delivered.",
  "You received the wrong item or amount from what you ordered.",
  "You were accidentally charged more than once for the same order.",
];

const notEligible = [
  "Change of mind after an order has already been delivered.",
  "Delivery to the wrong Roblox account because of an incorrect username entered at checkout.",
  "Issues caused by your own Roblox account being banned, restricted, or otherwise unable to receive items.",
];

export default function RefundPolicyPage() {
  return (
    <div className="mx-auto max-w-2xl px-6 py-20 sm:py-24">
      <h1 className="font-heading text-3xl font-semibold tracking-tight sm:text-4xl">
        Refund &amp; order policy
      </h1>
      <p className="text-muted-foreground mt-3 text-[15px] leading-relaxed">
        We&apos;d rather be upfront about this than leave you guessing. Here&apos;s
        exactly when a refund applies.
      </p>
      <Taglish size="md">
        Mas gusto naming sabihin sa&apos;yo agad kaysa iwan kang nagtataka.
        Eto na yung exact na sitwasyon kung kelan puwede mag-refund.
      </Taglish>

      <div className="mt-10 grid gap-5 sm:grid-cols-2">
        <div className="surface-premium rounded-2xl p-6">
          <div className="flex items-center gap-2.5">
            <CheckCircle2 className="text-primary size-5" />
            <h2 className="font-heading text-sm font-semibold">
              Refund eligible
            </h2>
          </div>
          <ul className="mt-4 flex flex-col gap-3">
            {eligible.map((item) => (
              <li
                key={item}
                className="text-muted-foreground text-sm leading-relaxed"
              >
                {item}
              </li>
            ))}
          </ul>
          <Taglish className="border-border/60 mt-4 border-t pt-3">
            Puwede kang mag-refund kung: hindi na-deliver yung order mo
            kahit na-confirm na yung bayad, mali yung natanggap mong item o
            amount, o na-double charge ka sa parehong order.
          </Taglish>
        </div>

        <div className="surface-premium rounded-2xl p-6">
          <div className="flex items-center gap-2.5">
            <XCircle className="text-muted-foreground size-5" />
            <h2 className="font-heading text-sm font-semibold">
              Not refund eligible
            </h2>
          </div>
          <ul className="mt-4 flex flex-col gap-3">
            {notEligible.map((item) => (
              <li
                key={item}
                className="text-muted-foreground text-sm leading-relaxed"
              >
                {item}
              </li>
            ))}
          </ul>
          <Taglish className="border-border/60 mt-4 border-t pt-3">
            Hindi puwede mag-refund kung: nagbago lang isip mo pagkatapos
            ma-deliver yung order, mali yung username na nilagay mo sa
            checkout, o naka-ban o restricted yung Roblox account mo.
          </Taglish>
        </div>
      </div>

      <div className="mt-10 flex flex-col gap-6">
        <div>
          <h2 className="font-heading text-base font-semibold">
            How order processing works
          </h2>
          <p className="text-muted-foreground mt-2 text-sm leading-relaxed">
            Orders are reviewed and confirmed manually after you send them to
            us on Messenger — there&apos;s a real person on the other end, not an
            automated queue. If your order is going to take longer than
            usual, we&apos;ll tell you directly rather than leave you without an
            update.
          </p>
          <Taglish>
            Bawat order, chine-check at kina-confirm namin nang mano-mano
            pagkatapos mong i-send sa Messenger — totoong tao ang sasagot
            sa&apos;yo, hindi bot. Kung medyo matagal yung order mo,
            sasabihin namin agad sa&apos;yo.
          </Taglish>
        </div>
        <div>
          <h2 className="font-heading text-base font-semibold">
            Requesting a refund
          </h2>
          <p className="text-muted-foreground mt-2 text-sm leading-relaxed">
            Message us on{" "}
            <Link href="/contact" className="text-primary hover:underline">
              Messenger
            </Link>{" "}
            with your order number and what went wrong. We&apos;ll look into it
            and get back to you.
          </p>
          <Taglish>
            I-message mo lang kami sa Messenger ng order number mo at kung
            ano yung problema. Titingnan namin agad tapos babalikan ka
            namin.
          </Taglish>
        </div>
      </div>
    </div>
  );
}
