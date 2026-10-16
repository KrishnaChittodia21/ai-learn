import type { ReactNode } from "react";

/** Minimum rendered width of a 600-unit-wide widget drawing. Below it (phones) the drawing keeps this width and
 * the stage scrolls sideways instead of shrinking 10-unit labels to ~5 px. Desktop layouts are unaffected. */
export const MIN_SVG_PX = 540;

export function WideSvg({
  children,
  label = "Diagram",
}: {
  children: ReactNode;
  label?: string;
}) {
  return (
    <div
      style={{ overflowX: "auto", overscrollBehaviorX: "contain" }}
      tabIndex={0}
      role="group"
      aria-label={`${label} (scrolls sideways on narrow screens)`}
    >
      <div style={{ minWidth: MIN_SVG_PX }}>{children}</div>
    </div>
  );
}
