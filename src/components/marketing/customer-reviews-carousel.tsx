"use client";

import { useEffect, useState } from "react";
import { motion, useReducedMotion as useReducedMotionQuery } from "framer-motion";
import useEmblaCarousel from "embla-carousel-react";
import { ArrowUpRight, ArrowLeft, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ReviewCard } from "@/components/marketing/review-card";
import { siteConfig } from "@/config/site";
import type { Review } from "@/types/review";

type ReviewsResponse = {
  reviews?: Review[];
};

export function CustomerReviewsCarousel({
  initialReviews,
}: {
  initialReviews: Review[];
}) {
  const [visibleReviews, setVisibleReviews] = useState(initialReviews);
  const reduceMotion = Boolean(useReducedMotionQuery());
  const [emblaRef, emblaApi] = useEmblaCarousel({ loop: true, align: "start" });

  useEffect(() => {
    let ignore = false;

    async function loadReviews() {
      try {
        const response = await fetch("/api/reviews", {
          headers: { Accept: "application/json" },
        });
        if (!response.ok) return;

        const data = (await response.json()) as ReviewsResponse;
        if (!ignore && Array.isArray(data.reviews) && data.reviews.length > 0) {
          setVisibleReviews(data.reviews);
        }
      } catch {
        // Keep the trusted initial set if the optional review refresh fails.
      }
    }

    loadReviews();

    return () => {
      ignore = true;
    };
  }, []);

  useEffect(() => {
    emblaApi?.reInit();
  }, [emblaApi, visibleReviews.length]);

  if (visibleReviews.length === 0) return null;

  return (
    <section aria-label="Customer reviews" className="mx-auto min-w-0 max-w-6xl px-6 pb-16 sm:pb-28">
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-80px" }}
        transition={{ duration: 0.5, ease: "easeOut" }}
        className="mx-auto max-w-xl text-center"
      >
        <p className="text-primary text-sm font-medium">
          Trusted by our customers
        </p>
        <h2 className="font-heading mt-3 text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
          Real people. Real orders. Real reviews.
        </h2>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 16 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-80px" }}
        transition={{ duration: 0.5, delay: 0.1, ease: "easeOut" }}
        className="relative mt-8 sm:mt-14"
      >
        <div
          ref={emblaRef}
          className="min-h-[218px] overflow-hidden sm:min-h-[242px] sm:[mask-image:linear-gradient(to_right,transparent,black_6%,black_94%,transparent)] sm:[-webkit-mask-image:linear-gradient(to_right,transparent,black_6%,black_94%,transparent)]"
        >
          <div className="flex gap-4">
            {visibleReviews.map((review) => (
              <div
                key={review.id}
                className="basis-[85%] shrink-0 sm:basis-[46%] lg:basis-[30%]"
              >
                <ReviewCard review={review} />
              </div>
            ))}
          </div>
        </div>
      </motion.div>

      <div className="mt-5 flex items-center justify-center gap-3">
        <Button variant="outline" className="size-11 rounded-full" aria-label="Previous reviews" onClick={() => emblaApi?.scrollPrev(reduceMotion)}><ArrowLeft className="size-4" /></Button>
        <span className="text-muted-foreground text-xs">Explore customer stories</span>
        <Button variant="outline" className="size-11 rounded-full" aria-label="Next reviews" onClick={() => emblaApi?.scrollNext(reduceMotion)}><ArrowRight className="size-4" /></Button>
      </div>
      {siteConfig.facebookVouchUrl && (
        <div className="mt-10 flex justify-center">
          <Button size="lg" asChild className="h-11 px-6">
            <a
              href={siteConfig.facebookVouchUrl}
              target="_blank"
              rel="noopener noreferrer"
            >
              View more reviews on Facebook
              <ArrowUpRight className="size-4" />
            </a>
          </Button>
        </div>
      )}
    </section>
  );
}
