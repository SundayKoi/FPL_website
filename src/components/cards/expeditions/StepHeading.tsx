// The stepper's numbered heading: "1 Pick three cards", with the number
// turning into a mint check once the step is done. Hook-free.

import type { ReactNode } from "react";
import ExpeditionIcon from "../expeditionIcons";

export default function StepHeading({ n, done = false, id, children }: { n: number; done?: boolean; id: string; children: ReactNode }) {
  return (
    <h2 id={id} className="flex items-center gap-3">
      <span
        aria-hidden
        className={`grid h-8 w-8 shrink-0 place-content-center rounded-full border font-mono text-sm font-bold ${
          done ? "border-mint/70 bg-mint/10 text-mint" : "border-coral/60 text-coral"
        }`}
      >
        {done ? <ExpeditionIcon name="check" /> : n}
      </span>
      <span className="type-display text-xl sm:text-2xl">{children}</span>
      {done ? <span className="sr-only">(done)</span> : null}
    </h2>
  );
}
