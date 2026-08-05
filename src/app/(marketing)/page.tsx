import { AnimatedHero } from "@/components/marketing/animated-hero";
import { TrustPoints } from "@/components/marketing/trust-points";
import { CustomerReviews } from "@/components/marketing/customer-reviews";
import { HowItWorksPreview } from "@/components/marketing/how-it-works-preview";
import { PopularGames } from "@/components/marketing/popular-games";
import { FeaturedProducts } from "@/components/marketing/featured-products";
import { FaqPreview } from "@/components/marketing/faq-preview";
import { getGames, getFeaturedGamepasses } from "@/lib/queries/catalog";

export const revalidate = 60;

export default async function LandingPage() {
  const [games, featuredProducts] = await Promise.all([
    getGames(),
    getFeaturedGamepasses(),
  ]);

  return (
    <div>
      <AnimatedHero />
      <TrustPoints />
      <CustomerReviews />
      <HowItWorksPreview />
      <PopularGames games={games.slice(0, 5)} />
      <FeaturedProducts products={featuredProducts} />
      <FaqPreview />
    </div>
  );
}
