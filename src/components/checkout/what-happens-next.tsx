import { ClipboardCheck, MessageCircle, ShieldCheck, PackageCheck } from "lucide-react";
import { Taglish } from "@/components/shared/taglish";

const points = [
  {
    icon: ClipboardCheck,
    title: "Your order is created first",
    description:
      "Clicking \"Place order\" doesn't charge you anything — it creates a real order with its own order number on our system.",
    taglish:
      "Hindi ka agad sisingilin kapag pinindot mo ang \"Place order\" — gagawa lang ito ng tunay na order na may sarili nitong order number sa amin.",
  },
  {
    icon: MessageCircle,
    title: "Messenger opens automatically",
    description:
      "You'll land on a confirmation page that opens Messenger with your order already typed in. Just review and hit send.",
    taglish:
      "Dadalhin ka sa confirmation page na magbubukas ng Messenger na may nakasulat nang order mo. I-check lang at i-send.",
  },
  {
    icon: ShieldCheck,
    title: "Payment isn't taken on this site",
    description:
      "We don't collect payment details here. You'll arrange payment directly with us over Messenger, after you send your order.",
    taglish:
      "Hindi kami kumukuha ng payment details dito. Pag-uusapan ang bayad sa Messenger, pagkatapos mong i-send ang order.",
  },
  {
    icon: PackageCheck,
    title: "We take it from there",
    description:
      "Once payment is confirmed, we process your order and deliver to the Roblox username you provided.",
    taglish:
      "Kapag kumpirmado na ang bayad, ipoproseso namin ang order mo at ide-deliver sa Roblox username na ibinigay mo.",
  },
];

export function WhatHappensNext() {
  return (
    <div className="mt-6 sm:mt-8">
      <h2 className="font-heading text-center text-sm font-semibold">
        What happens after you click Place order
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
            <Taglish>{point.taglish}</Taglish>
          </div>
        ))}
      </div>
    </div>
  );
}
