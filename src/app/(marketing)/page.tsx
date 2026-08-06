import { AnimatedHero } from "@/components/marketing/animated-hero";
import { CustomerReviews } from "@/components/marketing/customer-reviews";
import { HomepageOrderingGuide } from "@/components/marketing/homepage-ordering-guide";
import { TrustPoints } from "@/components/marketing/trust-points";
import { PopularGames } from "@/components/marketing/popular-games";
import { FaqPreview } from "@/components/marketing/faq-preview";
import { continuePlayingGameIds } from "@/config/homepage-picks";
import { getGames } from "@/lib/queries/catalog";

export const revalidate = 60;

export default async function LandingPage() {
  const games = await getGames();

  const gameById = new Map(games.map((game) => [game.id, game]));
  const continuePlayingGames = continuePlayingGameIds
    .map((id) => gameById.get(id))
    .filter((game) => game != null);

  return (
    <div>
      <AnimatedHero />
      <HomepageOrderingGuide />
      <CustomerReviews />
      <TrustPoints />
      <PopularGames games={continuePlayingGames} />
      <FaqPreview />
    </div>
  );
}
