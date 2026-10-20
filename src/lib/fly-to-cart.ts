"use client";

/**
 * The product's artwork flies into the header cart and the cart badge pops.
 * Pure Web Animations API on a fixed clone — nothing in the layout moves.
 * No-op for reduced motion or when either end isn't on screen.
 */
export function flyToCart(from: Element | null) {
  if (typeof window === "undefined" || !from) return;
  const target = document.querySelector<HTMLElement>("[data-cart-target]");
  if (!target) return;
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    bumpCart(target);
    return;
  }
  const source = from.closest("[data-product-tile]")?.querySelector<HTMLElement>("[data-product-art]") ?? null;
  const start = (source ?? (from as HTMLElement)).getBoundingClientRect();
  const end = target.getBoundingClientRect();
  if (start.width === 0 || end.width === 0) return;

  const ghost = document.createElement("div");
  const size = Math.min(start.width, start.height, 72);
  const image = source?.querySelector("img");
  Object.assign(ghost.style, {
    position: "fixed",
    left: `${start.left + start.width / 2 - size / 2}px`,
    top: `${start.top + start.height / 2 - size / 2}px`,
    width: `${size}px`,
    height: `${size}px`,
    borderRadius: "10px",
    zIndex: "200",
    pointerEvents: "none",
    background: image ? `center / cover no-repeat url("${image.currentSrc || image.src}")` : "var(--primary)",
    boxShadow: "0 12px 30px -10px color-mix(in oklch, var(--primary) 60%, transparent)",
  } satisfies Partial<CSSStyleDeclaration>);
  document.body.appendChild(ghost);

  const dx = end.left + end.width / 2 - (start.left + start.width / 2);
  const dy = end.top + end.height / 2 - (start.top + start.height / 2);
  const animation = ghost.animate(
    [
      { transform: "translate(0, 0) scale(1)", opacity: 1 },
      { transform: `translate(${dx * 0.55}px, ${dy * 0.55 - 60}px) scale(0.7)`, opacity: 1, offset: 0.55 },
      { transform: `translate(${dx}px, ${dy}px) scale(0.18)`, opacity: 0.2 },
    ],
    { duration: 720, easing: "cubic-bezier(0.65, 0, 0.35, 1)" },
  );
  animation.onfinish = () => {
    ghost.remove();
    bumpCart(target);
  };
}

function bumpCart(target: HTMLElement) {
  target.classList.remove("bw-pop");
  void target.offsetWidth;
  target.classList.add("bw-pop");
}
