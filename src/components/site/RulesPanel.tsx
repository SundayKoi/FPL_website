import type { ReactNode } from "react";

/**
 * "How this works": the rules of a money-moving surface, in one panel,
 * open by default. Six of them explained themselves in one sentence and
 * two more hid their rules in closed disclosures; this is the one shape
 * they all use now. Every figure the rows print is passed in from the
 * config that enforces it.
 */
export default function RulesPanel({
  title = "How this works",
  items,
  open = true,
  className = "",
}: {
  title?: string;
  items: ReactNode[];
  /** Open by default: the first thing a newcomer needs is the rule. */
  open?: boolean;
  className?: string;
}) {
  return (
    <details open={open} className={`group card-brand px-5 py-3 ${className}`} data-testid="rules-panel">
      <summary className="cursor-pointer list-none text-sm font-bold uppercase tracking-[0.14em] text-white transition group-open:text-coral">
        <span className="mr-2 inline-block text-coral transition group-open:rotate-90">▸</span>
        {title}
      </summary>
      <ul className="mt-3 flex list-disc flex-col gap-1.5 pl-5 text-sm leading-6 text-muted">
        {items.map((item, index) => (
          <li key={index}>{item}</li>
        ))}
      </ul>
    </details>
  );
}
