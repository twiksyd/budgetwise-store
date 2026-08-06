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
    title: "Ilagay ang Details",
    description: "Ilagay ang Facebook Name at Roblox Username ninyo.",
  },
  {
    title: "I-send sa Messenger",
    description: "Kopyahin at i-send sa amin ang buong order message.",
  },
];

export function HomepageOrderingGuide() {
  return (
    <section className="mx-auto max-w-6xl px-6 pb-12 sm:pb-16">
      <div className="grid gap-2.5 sm:grid-cols-4">
        {steps.map((step, index) => (
          <div
            key={step.title}
            className="surface-premium rounded-2xl p-3.5 sm:p-4"
          >
            <div className="bg-primary/10 text-primary flex size-7 items-center justify-center rounded-full text-xs font-bold">
              {index + 1}
            </div>
            <h2 className="font-heading mt-3 text-sm font-semibold">
              {step.title}
            </h2>
            <p className="text-muted-foreground mt-1.5 text-xs leading-relaxed">
              {step.description}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}
