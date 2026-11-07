import { AnimatedHero } from "@/components/marketing/animated-hero";
import { CustomerReviews } from "@/components/marketing/customer-reviews";
import { HomepageOrderingGuide } from "@/components/marketing/homepage-ordering-guide";
import { TrustPoints } from "@/components/marketing/trust-points";
import { PopularGames } from "@/components/marketing/popular-games";
import { FaqPreview } from "@/components/marketing/faq-preview";
import {
  getFeaturedStoreGames,
  getGameProductCounts,
  getGamesAndPresentation,
} from "@/lib/queries/catalog";
import { robuxGameIds } from "@/config/robux-products";

export const revalidate = 60;

// One swipeable row: enough to browse, with "Lahat ng games" for the rest.
const HOME_SHELF_SIZE = 10;

// Shop first: hero, then games to tap into, then (collapsed) how ordering
// works, then the reasons to trust us.
export default async function LandingPage() {
  const [{ games, presentation }, productCounts] = await Promise.all([
    getGamesAndPresentation(),
    getGameProductCounts(),
  ]);
  // Curated picks first, then the next available games in catalog order,
  // so the carousel always has a full row to swipe through.
  const featured = getFeaturedStoreGames(games, presentation);
  const featuredIds = new Set(featured.map((game) => game.id));
  const featuredGames = [
    ...featured,
    ...games.filter(
      (game) =>
        !featuredIds.has(game.id) &&
        !robuxGameIds.includes(game.id) &&
        game.availability_status === "available",
    ),
  ].slice(0, HOME_SHELF_SIZE);

  return (
    <div>
      <AnimatedHero />
      <PopularGames games={featuredGames} productCounts={productCounts} />
      <CustomerReviews />
      <HomepageOrderingGuide />
      <TrustPoints />
      <FaqPreview />
    </div>
  );
}
