// One strip for everything happening in the shop this week.
//
// The first notice gets the full line — title, what it means, the detail.
// Anything after it is a chip: the title and the one line, no more, so a
// week with four things going on is still one row and the buy button is
// still above the fold.

import type { WeekNotice, WeekNoticeTone } from "@/lib/packs/weekNotices";

const TONE: Record<WeekNoticeTone, { box: string; title: string }> = {
  live: { box: "border-red-400/50 bg-red-500/10", title: "text-red-300" },
  red: { box: "border-[#d61f2c]/60 bg-[#d61f2c]/10", title: "text-[#ff6b76]" },
  gold: { box: "border-gold/50 bg-gold/10", title: "text-gold" },
};

export default function ThisWeekStrip({ notices }: { notices: WeekNotice[] }) {
  if (notices.length === 0) return null;
  const [lead, ...rest] = notices;
  const tone = TONE[lead.tone];

  return (
    <section aria-label="This week" className={`flex flex-col gap-2 rounded-xl border px-4 py-3 ${tone.box}`}>
      <div className="flex flex-wrap items-center gap-3">
        <span className={`flex items-center gap-2 text-sm font-bold uppercase tracking-[0.14em] ${tone.title}`}>
          {lead.tone === "live" ? <span aria-hidden className="inline-block h-2 w-2 animate-pulse rounded-full bg-red-400" /> : null}
          {lead.title}
        </span>
        <span className="text-sm text-white">{lead.text}</span>
        {lead.detail ? <span className="text-xs text-steel">{lead.detail}</span> : null}
      </div>
      {rest.length > 0 ? (
        <ul className="flex flex-wrap gap-2">
          {rest.map((notice) => (
            <li
              key={notice.key}
              title={notice.detail}
              className={`flex items-center gap-2 rounded-full border px-3 py-1 text-xs ${TONE[notice.tone].box}`}
            >
              <span className={`font-bold uppercase tracking-[0.12em] ${TONE[notice.tone].title}`}>{notice.title}</span>
              <span className="text-white">{notice.text}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
