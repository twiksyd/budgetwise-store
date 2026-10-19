"use client";

import { useEffect, useState } from "react";
import { siteConfig } from "@/config/site";
import { chooseOrderChannel, orderMessengerLink } from "@/lib/order-handoff.mjs";
import { readTrafficSource } from "@/components/shared/traffic-source-capture";

/**
 * Where "Message Us Now" and similar contact buttons lead, by the same rule
 * as orders (siteConfig.orderHandoff): the BudgetWise DGM Messenger page, or
 * the on-site chat for the sources that keep it (e.g. TikTok, when enabled).
 * Decided after mount (the traffic source lives in this browser); before
 * that it reports the config default.
 */
export function useContactChannel() {
  const [channel, setChannel] = useState(() => chooseOrderChannel(undefined, siteConfig.orderHandoff));
  useEffect(() => {
    setChannel(chooseOrderChannel(readTrafficSource(), siteConfig.orderHandoff));
  }, []);
  return {
    channel,
    messengerLink: orderMessengerLink(siteConfig.messengerPageId, null),
  };
}
