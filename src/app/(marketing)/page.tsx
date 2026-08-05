import { AnimatedHero } from "@/components/marketing/animated-hero";
import { TrustPoints } from "@/components/marketing/trust-points";

export default function LandingPage() {
  return (
    <div className="flex flex-col">
      <AnimatedHero />
      <TrustPoints />
    </div>
  );
}
