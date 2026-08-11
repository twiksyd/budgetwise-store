import type { Metadata } from "next";
import { GamepassTutorialClient } from "@/components/gamepass-tutorial/gamepass-tutorial-client";
import { getGeneralMessengerLink } from "@/lib/messenger";

export const metadata: Metadata = {
  title: "Gamepass setup guide",
  description:
    "A step-by-step guide to creating your Roblox experience and gamepass for your BudgetWise order.",
};

export default async function GamepassTutorialPage({
  searchParams,
}: {
  searchParams: Promise<{ price?: string }>;
}) {
  const { price } = await searchParams;
  const initialPrice = price && /^\d+$/.test(price) ? price : null;
  const messengerLink = getGeneralMessengerLink();

  return (
    <GamepassTutorialClient
      initialPrice={initialPrice}
      messengerLink={messengerLink}
    />
  );
}
