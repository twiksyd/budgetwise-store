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
        Mas gusto naming maging tapat kaysa iwan kang nagtataka. Narito ang
        eksaktong panahon kung kailan puwede ang refund.
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
            Puwede ang refund kung: hindi na-deliver ang order kahit
            kumpirmado na ang bayad, mali ang natanggap mong item o halaga,
            o na-double charge ka sa parehong order.
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
            Hindi puwede ang refund kung: nagbago lang ang isip mo
            pagkatapos ma-deliver ang order, mali ang username na inilagay
            sa checkout, o naka-ban o restricted ang sarili mong Roblox
            account.
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
            Ang mga order ay sinusuri at kinukumpirma nang manual pagkatapos
            mong i-send sa Messenger — totoong tao ang sasagot, hindi
            automated. Kung mas matagal ang order mo sa karaniwan, sasabihin
            namin agad sa iyo.
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
            I-message kami sa Messenger ng order number mo at kung ano ang
            problema. Titingnan namin ito at babalikan ka.
          </Taglish>
        </div>
      </div>
    </div>
  );
}
