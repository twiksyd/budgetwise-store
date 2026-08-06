import { CustomerReviewsCarousel } from "@/components/marketing/customer-reviews-carousel";
import { OptionalSectionBoundary } from "@/components/shared/optional-section-boundary";
import { reviews } from "@/config/reviews";

const INITIAL_REVIEW_COUNT = 8;

export function CustomerReviews() {
  const initialReviews = reviews.slice(0, INITIAL_REVIEW_COUNT);

  if (initialReviews.length === 0) return null;

  return (
    <OptionalSectionBoundary name="Customer reviews">
      <CustomerReviewsCarousel initialReviews={initialReviews} />
    </OptionalSectionBoundary>
  );
}
