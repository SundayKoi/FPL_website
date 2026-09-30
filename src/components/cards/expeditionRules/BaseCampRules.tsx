import { CAMP_LINES, CAMP_PRICES, CAMP_UPGRADES, POLICY_LINE, priceLine, type CampPrice } from "@/lib/expeditions/camp";

/** A camp level's game word, when it is not just its plain one: "squad
 *  slot" beside "A second scouting squad", nothing beside "A tent". */
function alsoCalled(title: string, term: string): string | null {
  const plain = title.toLowerCase().replace(/^(a|an|the)\s+/, "");
  return plain === term.toLowerCase() ? null : term.toLowerCase();
}

/** Every level of every upgrade, bought: what the whole camp costs. */
const CAMP_TOTAL: CampPrice = CAMP_UPGRADES.flatMap((upgrade) => CAMP_PRICES[upgrade]).reduce(
  (sum, price) => ({ dollars: sum.dollars + price.dollars, fragments: sum.fragments + price.fragments }),
  { dollars: 0, fragments: 0 },
);

export default function BaseCampRules() {
  const policyTerm = alsoCalled(POLICY_LINE.title, POLICY_LINE.term);
  return (
    <div data-testid="rule-base-camp" className="flex flex-col gap-2 rounded-lg border border-line bg-panel/60 p-3 text-sm text-steel">
      <h3 className="type-display text-lg text-white">Base camp: what you build between runs</h3>
      <p>
        Your camp is yours for good: every season, in both leagues. Build it a level at a time on the Camp tab, with dollars and
        sometimes map fragments. Every level of everything comes to{" "}
        <strong data-testid="rule-camp-total" className="text-white">
          {priceLine(CAMP_TOTAL)}
        </strong>
        .
      </p>
      <ul className="grid gap-2 sm:grid-cols-2">
        {CAMP_UPGRADES.map((upgrade) => {
          const first = CAMP_LINES[upgrade][0];
          const term = alsoCalled(first.title, first.term);
          const levels = CAMP_PRICES[upgrade];
          return (
            <li key={upgrade} data-testid={`rule-camp-${upgrade}`} className="flex flex-col gap-1.5 rounded-md border border-line bg-black/30 p-2.5">
              <span className="text-sm font-semibold text-white">
                {first.title}
                {term ? <span className="font-normal text-steel"> ({term})</span> : null}
              </span>
              <ol className="flex flex-col gap-1.5">
                {levels.map((price, index) => {
                  const line = CAMP_LINES[upgrade][index] ?? first;
                  return (
                    <li key={index} data-testid={`rule-camp-${upgrade}-${index + 1}`} className="flex flex-col gap-0.5 text-xs">
                      <span className="font-semibold text-gold">
                        {levels.length > 1 ? `Level ${index + 1}${index > 0 ? ` · ${line.title}` : ""} · ` : ""}
                        {priceLine(price)}
                      </span>
                      <span>{line.does}</span>
                    </li>
                  );
                })}
              </ol>
            </li>
          );
        })}
        <li data-testid="rule-camp-policy" className="flex flex-col gap-1.5 rounded-md border border-line bg-black/30 p-2.5">
          <span className="text-sm font-semibold text-white">
            {POLICY_LINE.title}
            {policyTerm ? <span className="font-normal text-steel"> ({policyTerm})</span> : null}
          </span>
          <span className="flex flex-col gap-0.5 text-xs">
            <span className="font-semibold text-gold">
              {priceLine(CAMP_PRICES.policy[0])} · needs {CAMP_LINES.forge[0].title.toLowerCase()}
            </span>
            <span>{POLICY_LINE.does}</span>
          </span>
        </li>
      </ul>
    </div>
  );
}
