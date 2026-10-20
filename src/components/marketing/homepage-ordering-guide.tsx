import { DrawLine, Stagger, StaggerItem } from "@/components/motion/reveal";

const steps = [
  {
    title: "Pumili ng Game",
    description: "Hanapin ang game na gusto ninyong bilhan.",
  },
  {
    title: "I-add sa Cart",
    description: "Piliin at i-add sa cart ang items na gusto ninyo.",
  },
  {
    title: "Mag-sign in at Checkout",
    description: "Mag-sign in gamit ang Google, tapos ilagay ang Roblox Username ninyo.",
  },
  {
    title: "Makipag-chat sa Amin",
    description: "Hintayin ang reply namin sa Order Chat dito mismo sa website.",
  },
];

// Four steps that read as one sequence: they cascade in left to right while
// a hairline draws across behind their numbers.
export function HomepageOrderingGuide() {
  return (
    <section className="mx-auto max-w-6xl px-6 pb-12 sm:pb-16">
      <div className="relative">
        <DrawLine className="bg-border absolute top-[1.85rem] right-6 left-6 hidden h-px sm:block" />
        <Stagger className="relative grid gap-2.5 sm:grid-cols-4">
          {steps.map((step, index) => (
            <StaggerItem key={step.title} className="surface-premium group rounded-xl p-3.5 sm:p-4">
              <div className="text-primary bg-card relative z-10 inline-block pr-2 font-heading text-lg font-bold tabular-nums">
                {index + 1}
              </div>
              <h2 className="font-heading relative z-10 mt-2 text-sm font-semibold">
                {step.title}
              </h2>
              <p className="text-muted-foreground relative z-10 mt-1.5 text-xs leading-relaxed">
                {step.description}
              </p>
            </StaggerItem>
          ))}
        </Stagger>
      </div>
    </section>
  );
}
