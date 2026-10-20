"use client";

import { motion, type HTMLMotionProps, type Variants } from "framer-motion";

const EASE = [0.16, 1, 0.3, 1] as const;

/**
 * Content rises softly into place the first time it scrolls into view.
 * Opacity + 16px + a light blur that clears — subtle enough for every
 * section, and skipped entirely for reduced motion (MotionConfig "user").
 */
export function Reveal({
  delay = 0,
  y = 16,
  className,
  children,
  ...props
}: { delay?: number; y?: number } & HTMLMotionProps<"div">) {
  return (
    <motion.div
      initial={{ opacity: 0, y, filter: "blur(6px)" }}
      whileInView={{ opacity: 1, y: 0, filter: "blur(0px)" }}
      viewport={{ once: true, margin: "0px 0px -12% 0px" }}
      transition={{ duration: 0.7, ease: EASE, delay }}
      className={className}
      {...props}
    >
      {children}
    </motion.div>
  );
}

const group: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.06, delayChildren: 0.04 } },
};
const groupItem: Variants = {
  hidden: { opacity: 0, y: 18, scale: 0.98 },
  show: { opacity: 1, y: 0, scale: 1, transition: { duration: 0.6, ease: EASE } },
};

/** A grid / list whose children enter one after another (use with StaggerItem). */
export function Stagger({ className, children, ...props }: HTMLMotionProps<"div">) {
  return (
    <motion.div
      variants={group}
      initial="hidden"
      whileInView="show"
      viewport={{ once: true, margin: "0px 0px -8% 0px" }}
      className={className}
      {...props}
    >
      {children}
    </motion.div>
  );
}

export function StaggerItem({ className, children, ...props }: HTMLMotionProps<"div">) {
  return (
    <motion.div variants={groupItem} className={className} {...props}>
      {children}
    </motion.div>
  );
}

const lineWords: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.05 } },
};
const lineWord: Variants = {
  hidden: { y: "105%" },
  show: { y: "0%", transition: { duration: 0.8, ease: EASE } },
};

/** A heading whose words rise from behind a mask when it scrolls into view. */
export function RevealText({ text, className }: { text: string; className?: string }) {
  return (
    <motion.span
      variants={lineWords}
      initial="hidden"
      whileInView="show"
      viewport={{ once: true, margin: "0px 0px -10% 0px" }}
      className={className}
      aria-label={text}
    >
      {text.split(" ").map((part, index) => (
        <span key={index} aria-hidden className="inline-block overflow-hidden pb-[0.1em] align-bottom">
          <motion.span variants={lineWord} className="inline-block">
            {part}
            {" "}
          </motion.span>
        </span>
      ))}
    </motion.span>
  );
}

/** A hairline that draws itself across (or down) when it enters view. */
export function DrawLine({ className, vertical = false }: { className?: string; vertical?: boolean }) {
  return (
    <motion.span
      aria-hidden
      initial={vertical ? { scaleY: 0 } : { scaleX: 0 }}
      whileInView={vertical ? { scaleY: 1 } : { scaleX: 1 }}
      viewport={{ once: true }}
      transition={{ duration: 1.1, ease: EASE }}
      className={className}
      style={{ transformOrigin: vertical ? "top" : "left" }}
    />
  );
}
