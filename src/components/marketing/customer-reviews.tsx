"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import useEmblaCarousel from "embla-carousel-react";
import AutoScroll from "embla-carousel-auto-scroll";
import { ArrowUpRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ReviewCard } from "@/components/marketing/review-card";
import { reviews } from "@/config/reviews";
import { siteConfig } from "@/config/site";

export function CustomerReviews() {
  // Continuous auto-scroll never truly settles — stopOnInteraction:false
  // means it resumes drifting moments after any swipe, so on mobile (where
  // one slide = the whole viewport) it can never reliably rest on a single
  // fully-visible card. Fine-pointer (mouse) devices keep the original
  // ambient marquee; touch devices get a plain swipe-driven carousel that
  // snaps and stays put.
  const [plugins] = useState(() =>
    typeof window !== "undefined" &&
    window.matchMedia("(pointer: coarse)").matches
      ? []
      : [
          AutoScroll({
            speed: 0.7,
            stopOnMouseEnter: true,
            stopOnInteraction: false,
          }),
        ],
  );
  // dragFree is intentionally off: snapping (the Embla default) is what
  // guarantees a swipe always settles on exactly one fully-visible,
  // centered card instead of stopping mid-transition between two.
  const [emblaRef] = useEmblaCarousel({ loop: true, align: "start" }, plugins);

  if (reviews.length === 0) return null;

  return (
    // min-w-0 guards against the flex "min-width: auto" blowout: without it,
    // a flex-item ancestor would size itself to the carousel track's huge
    // intrinsic content width (hundreds of non-shrinking full-width slides)
    // instead of the viewport, forcing the whole page wider than the screen.
    <section className="mx-auto min-w-0 max-w-6xl px-6 pb-16 sm:pb-28">
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
        <div className="hero-glow pointer-events-none absolute -inset-x-6 -inset-y-10 -z-10 rounded-[2.5rem]" />
        <div
          ref={emblaRef}
          className="overflow-hidden sm:[mask-image:linear-gradient(to_right,transparent,black_6%,black_94%,transparent)] sm:[-webkit-mask-image:linear-gradient(to_right,transparent,black_6%,black_94%,transparent)]"
        >
          <div className="flex gap-4">
            {reviews.map((review) => (
              <div
                key={review.id}
                className="basis-full shrink-0 sm:basis-[46%] lg:basis-[30%]"
              >
                <ReviewCard review={review} />
              </div>
            ))}
          </div>
        </div>
      </motion.div>

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
