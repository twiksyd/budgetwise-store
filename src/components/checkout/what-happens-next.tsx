import {
  ClipboardCheck,
  MessageCircle,
  ShieldCheck,
  PackageCheck,
} from "lucide-react";

const points = [
  {
    icon: ClipboardCheck,
    title: "Gagawa muna ng Order Slip",
    description:
      "Pag-click ng Gumawa ng Order Slip, wala pa pong bayad. Gagawa lang ito ng order reference sa system namin.",
  },
  {
    icon: MessageCircle,
    title: "I-send ang buong message",
    description:
      "Sa next page, kopyahin ang buong order message, buksan ang Messenger, tapos i-paste at i-send.",
  },
  {
    icon: ShieldCheck,
    title: "Walang payment dito",
    description:
      "Payment instructions ay ibibigay lang namin sa Messenger pagkatapos naming ma-review ang order.",
  },
  {
    icon: PackageCheck,
    title: "Kami na ang magpo-process",
    description:
      "Kapag confirmed na ang payment, ipprocess namin ang order sa Roblox Username na nilagay ninyo.",
  },
];

export function WhatHappensNext() {
  return (
    <div className="mt-6 sm:mt-8">
      <h2 className="font-heading text-center text-sm font-semibold">
        Ano ang mangyayari pagkatapos gumawa ng Order Slip
      </h2>
      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        {points.map((point) => (
          <div key={point.title} className="surface-premium rounded-2xl p-5">
            <div className="bg-primary/10 flex size-9 items-center justify-center rounded-lg">
              <point.icon className="text-primary size-4" />
            </div>
            <p className="font-heading mt-3.5 text-sm font-semibold">
              {point.title}
            </p>
            <p className="text-muted-foreground mt-1.5 text-xs leading-relaxed">
              {point.description}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
