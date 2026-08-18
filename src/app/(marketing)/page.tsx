import { AnimatedHero } from "@/components/marketing/animated-hero";
import { CustomerReviews } from "@/components/marketing/customer-reviews";
import { HomepageOrderingGuide } from "@/components/marketing/homepage-ordering-guide";
import { TrustPoints } from "@/components/marketing/trust-points";
import { PopularGames } from "@/components/marketing/popular-games";
import { FaqPreview } from "@/components/marketing/faq-preview";
import {
  getFeaturedStoreGames,
  getGamesAndPresentation,
} from "@/lib/queries/catalog";

export const revalidate = 60;

export default async function LandingPage() {
  const { games, presentation } = await getGamesAndPresentation();
  const continuePlayingGames = getFeaturedStoreGames(games, presentation);

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
