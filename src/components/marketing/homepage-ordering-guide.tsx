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

export function HomepageOrderingGuide() {
  return (
    <section className="mx-auto max-w-6xl px-6 pb-12 sm:pb-16">
      <div className="mb-7 max-w-xl">
        <p className="text-primary text-sm font-medium">Simple from the start</p>
        <h2 className="font-heading mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">A little guidance. Every step.</h2>
      </div>
      <ol className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {steps.map((step, index) => (
          <li
            key={step.title}
            className="bg-muted/40 rounded-2xl border border-border/60 p-6"
          >
            <div className="text-muted-foreground font-heading text-sm font-medium tabular-nums">
              0{index + 1}
            </div>
            <h3 className="font-heading mt-5 text-base font-semibold">
              {step.title}
            </h3>
            <p className="text-muted-foreground mt-2 text-sm leading-relaxed">
              {step.description}
            </p>
          </li>
        ))}
      </ol>
    </section>
  );
}
