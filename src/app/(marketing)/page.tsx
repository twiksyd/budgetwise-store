import { AnimatedHero } from "@/components/marketing/animated-hero";
import { TrustPoints } from "@/components/marketing/trust-points";
import { CustomerReviews } from "@/components/marketing/customer-reviews";
import { HowItWorksPreview } from "@/components/marketing/how-it-works-preview";
import { PopularGames } from "@/components/marketing/popular-games";
import { FeaturedProducts } from "@/components/marketing/featured-products";
import { FaqPreview } from "@/components/marketing/faq-preview";
import { getGames, getFeaturedGamepasses } from "@/lib/queries/catalog";
import { continuePlayingGameIds } from "@/config/homepage-picks";

export const revalidate = 60;

export default async function LandingPage() {
  const [games, featuredProducts] = await Promise.all([
    getGames(),
    getFeaturedGamepasses(),
  ]);

  const gameById = new Map(games.map((game) => [game.id, game]));
  const continuePlayingGames = continuePlayingGameIds
    .map((id) => gameById.get(id))
    .filter((game) => game != null);

  return (
    <div>
      <AnimatedHero />
      <TrustPoints />
      {/* Shopping content surfaces right after the quick trust points —
          Reviews/How-It-Works are worthwhile reinforcement, but shouldn't
          sit between a first-time visitor and the actual product grid. */}
      <PopularGames games={continuePlayingGames} />
      <FeaturedProducts products={featuredProducts} />
      <CustomerReviews />
      <HowItWorksPreview />
      <FaqPreview />
    </div>
  );
}
