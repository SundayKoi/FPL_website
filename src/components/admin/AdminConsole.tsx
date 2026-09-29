"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import styles from "./AdminConsole.module.css";

type League = "premier" | "academy";
type QueueType = "reports" | "claims";
export type AdminQueueItem = {
  id: string;
  title: string;
  detail: string;
  href: string;
  action: string;
  type: QueueType;
  icon: string;
  createdAt: string;
};
export type AdminActivityItem = {
  id: string;
  title: string;
  detail: string;
  occurredAt: string;
  timeLabel: string;
  icon: string;
};
type Tool = {
  label: string;
  description: string;
  href: string;
  icon: string;
  ownerOnly?: boolean;
};
type ToolGroup = {
  number: string;
  title: string;
  category: "league" | "content" | "cards" | "insights";
  tools: Tool[];
};

const toolColumns: ToolGroup[][] = [
  [
    {
      number: "01",
      title: "League",
      category: "league",
      tools: [
        { label: "Signups", description: "Premier signup window & player applications", href: "/admin/league/signups", icon: "calendar" },
        { label: "Schedule", description: "Fixtures, scores & season phase", href: "/admin/league/schedule", icon: "file" },
        { label: "Players", description: "Pool & average bids", href: "/admin/league/players", icon: "people" },
        { label: "Teams", description: "Captains, identity & rosters", href: "/admin/league/teams", icon: "shield" },
        { label: "Draft room", description: "Auctions & assignments", href: "/admin/league/drafts", icon: "people", ownerOnly: true },
      ],
    },
    {
      number: "02",
      title: "Broadcast & content",
      category: "content",
      tools: [
        { label: "Homepage", description: "Featured matches & display mode", href: "/admin/content", icon: "monitor" },
        { label: "Announcements", description: "Prepared channel posts", href: "/admin/announce", icon: "file" },
        { label: "The Daily Stu", description: "Titles & editorial controls", href: "/admin/content?panel=daily-stu", icon: "megaphone" },
      ],
    },
  ],
  [
    {
      number: "03",
      title: "Cards & rewards",
      category: "cards",
      tools: [
        { label: "Card claims", description: "Player card ownership reviews", href: "/admin/claims", icon: "file" },
        { label: "Roster identity claims", description: "Player-to-team identity requests", href: "/admin/reviews/identity", icon: "people" },
        { label: "Season’s End", description: "Regular-season honors", href: "/admin/seasons-end", icon: "trophy" },
        { label: "The Send-off", description: "Playoff editions", href: "/admin/sendoff", icon: "star" },
        { label: "On Air", description: "Live-drop caster cards", href: "/admin/on-air", icon: "broadcast" },
        { label: "Expedition seasons", description: "Standings & season close", href: "/admin/expeditions", icon: "compass" },
        { label: "Expedition board", description: "Review and curate expedition cards", href: "/admin/expedition-board", icon: "compass" },
        { label: "Expedition map", description: "Manage expedition map content", href: "/admin/expedition-map", icon: "compass" },
      ],
    },
    {
      number: "04",
      title: "Economy & insights",
      category: "insights",
      tools: [
        { label: "Betting", description: "Markets, pick’ems & catalog", href: "/admin/betting", icon: "chart" },
        { label: "Analytics", description: "Activity, pulls & balances", href: "/admin/analytics", icon: "chart" },
        { label: "Patrons", description: "Receipts & grants", href: "/admin/patrons", icon: "heart", ownerOnly: true },
        { label: "Staff & access", description: "Roles & permissions", href: "/admin/access", icon: "people", ownerOnly: true },
      ],
    },
  ],
];

const designTools: Tool[] = [
  { label: "Parallels", description: "Foil treatments", href: "/admin/parallels", icon: "arrow" },
  { label: "Skin-line parallels", description: "Seasonal skin line", href: "/admin/design", icon: "arrow" },
  { label: "Expedition mutations", description: "Expedition card traits", href: "/admin/mutations", icon: "arrow" },
  { label: "Card overlays", description: "Alternate card finishes", href: "/admin/overlays", icon: "arrow" },
  { label: "The Dribb card", description: "Five-copy chase print", href: "/admin/dribb", icon: "arrow" },
  { label: "God Pack preview", description: "Preview the pack reveal", href: "/admin/design#god-pack-preview", icon: "arrow" },
  { label: "Guess the Card", description: "Daily game preview", href: "/admin/design", icon: "arrow" },
];

const filterTabs = [
  { id: "all", label: "All tools" },
  { id: "league", label: "League" },
  { id: "cards", label: "Cards" },
  { id: "content", label: "Content" },
  { id: "owner", label: "Owner" },
] as const;

function Icon({ name, size = 22 }: { name: string; size?: number }) {
  const paths: Record<string, ReactNode> = {
    home: <><path d="m3 10 9-7 9 7" /><path d="M5 9v11h14V9M9 20v-6h6v6" /></>,
    calendar: <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M16 3v4M8 3v4M3 10h18" /></>,
    file: <><path d="M6 2h8l5 5v15H6z" /><path d="M14 2v6h5M9 13h7M9 17h7" /></>,
    people: <><circle cx="9" cy="8" r="3" /><path d="M3 20v-1a6 6 0 0 1 12 0v1zM16 5a3 3 0 0 1 0 6M18 14a5 5 0 0 1 3 5v1h-4" /></>,
    shield: <><path d="M12 22s8-4 8-11V5l-8-3-8 3v6c0 7 8 11 8 11z" /><path d="m9 12 2 2 4-4" /></>,
    monitor: <><rect x="3" y="4" width="18" height="13" rx="2" /><path d="M8 21h8M12 17v4" /></>,
    megaphone: <><path d="m3 11 18-6v14L3 13zM6 14l2 7h4l-2-6M3 11v2" /></>,
    trophy: <><path d="M8 21h8M12 17v4M7 4h10v6a5 5 0 0 1-10 0zM7 6H3v2a5 5 0 0 0 5 5M17 6h4v2a5 5 0 0 1-5 5" /></>,
    star: <path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-3-5.6 3 1.1-6.2L3 9.6l6.2-.9z" />,
    broadcast: <><circle cx="12" cy="12" r="2" /><path d="M5.6 5.6a9 9 0 0 0 0 12.8M18.4 5.6a9 9 0 0 1 0 12.8M2.8 2.8a13 13 0 0 0 0 18.4M21.2 2.8a13 13 0 0 1 0 18.4" /></>,
    compass: <><circle cx="12" cy="12" r="9" /><path d="m15.5 8.5-2 5-5 2 2-5z" /></>,
    chart: <><path d="M4 20V10M10 20V4M16 20v-7M22 20H2" /></>,
    heart: <path d="M20.8 8.7c0 5.1-8.8 11-8.8 11S3.2 13.8 3.2 8.7A4.7 4.7 0 0 1 12 6.4a4.7 4.7 0 0 1 8.8 2.3z" />,
    flask: <><path d="M9 3h6M10 3v6l-6 10a1.3 1.3 0 0 0 1.1 2h13.8a1.3 1.3 0 0 0 1.1-2L14 9V3" /><path d="M7 16h10" /></>,
    arrow: <><path d="M4 12h15M13 5l7 7-7 7" /></>,
    search: <><circle cx="10.8" cy="10.8" r="6.8" /><path d="m16 16 5 5" /></>,
  };

  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      {paths[name] ?? paths.file}
    </svg>
  );
}

function toolHref(tool: Tool, league: League, season: string): string {
  const leagueParam = `league=${league}`;
  const context = `league=${league}&season=${encodeURIComponent(season)}`;
  switch (tool.label) {
    case "Schedule":
      return `/admin/league/schedule?${context}`;
    case "Players":
      return `/admin/league/players?${context}`;
    case "Teams":
      return `/admin/league/teams?league=${league}`;
    case "Season’s End":
      return `${tool.href}?${leagueParam}`;
    case "The Send-off":
      return `${tool.href}?${leagueParam}`;
    case "Homepage":
      return "/admin/content";
    case "The Daily Stu":
      return "/admin/content?panel=daily-stu";
    case "Draft room":
      return "/admin/league/drafts";
    case "Staff & access":
      return "/admin/access";
    case "God Pack preview":
      return "/admin/design#god-pack-preview";
    default:
      return tool.href;
  }
}

function toolMatchesCategory(group: ToolGroup, tool: Tool, category: string) {
  if (category === "all") return true;
  if (category === "owner") return Boolean(tool.ownerOnly);
  return group.category === category;
}

export type AdminScheduleRow = {
  id: string;
  matchup: string;
  starts: string;
  status: string;
};

export default function AdminConsole({
  view,
  isOwner,
  isFullAdmin,
  league,
  season,
  featuredSeason,
  defaultSeasons,
  seasonOptions,
  phase,
  upcomingCount,
  settingsAvailable = true,
  signupsOpen,
  homepageMode,
  featuredMatch,
  upcoming,
  today,
  canReviewQueues = false,
  queueCounts = { reports: 0, claims: 0 },
  queueItems = [],
  queueUnavailable = false,
  recentActivity = [],
  initialQuery = "",
}: {
  view: "overview" | "tools";
  isOwner: boolean;
  isFullAdmin: boolean;
  league: League;
  season: string;
  featuredSeason?: string;
  defaultSeasons: Record<League, string>;
  seasonOptions: string[];
  phase: string;
  upcomingCount: number;
  settingsAvailable?: boolean;
  signupsOpen: boolean;
  homepageMode: string;
  featuredMatch: { teamA: string; teamB: string; starts: string } | null;
  upcoming: AdminScheduleRow[];
  today: string;
  canReviewQueues?: boolean;
  queueCounts?: { reports: number; claims: number };
  queueItems?: AdminQueueItem[];
  queueUnavailable?: boolean;
  recentActivity?: AdminActivityItem[];
  initialQuery?: string;
}) {
  const pathname = usePathname() ?? "/admin";
  const searchParams = useSearchParams();
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState(initialQuery);
  const [queueFilter, setQueueFilter] = useState<"all" | QueueType>("all");
  const currentCategory = searchParams?.get("category") ?? "all";
  const [toolFilter, setToolFilter] = useState(currentCategory);

  const [previousContext, setPreviousContext] = useState({ initialQuery, currentCategory, pathname });
  if (previousContext.initialQuery !== initialQuery || previousContext.pathname !== pathname) {
    setQuery(initialQuery);
  }
  if (previousContext.currentCategory !== currentCategory || previousContext.pathname !== pathname) {
    setToolFilter(currentCategory);
  }
  if (previousContext.initialQuery !== initialQuery || previousContext.currentCategory !== currentCategory || previousContext.pathname !== pathname) {
    setPreviousContext({ initialQuery, currentCategory, pathname });
  }

  useEffect(() => {
    const onShortcut = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        inputRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onShortcut);
    return () => window.removeEventListener("keydown", onShortcut);
  }, []);

  const activeSeasonOptions = seasonOptions.length ? seasonOptions : [season];
  const homepageSeason = featuredSeason ?? season;
  const visibleColumns = useMemo(() => toolColumns.map((column) => column.map((group) => ({
    ...group,
    tools: group.tools.filter((tool) => {
      const needle = query.trim().toLocaleLowerCase();
      const queryMatches = !needle || `${tool.label} ${tool.description} ${group.title}`.toLocaleLowerCase().includes(needle);
      return queryMatches && toolMatchesCategory(group, tool, toolFilter);
    }),
  })).filter((group) => group.tools.length)), [query, toolFilter]);

  const visibleDesignTools = designTools.filter((tool) => {
    const needle = query.trim().toLocaleLowerCase();
    return (!needle || `${tool.label} ${tool.description}`.toLocaleLowerCase().includes(needle)) && toolFilter === "all";
  });
  const visibleQueueItems = useMemo(() => queueItems
    .filter((item) => queueFilter === "all" || item.type === queueFilter)
    .slice(0, 6), [queueFilter, queueItems]);
  const activeQueueCount = queueFilter === "all"
    ? queueCounts.reports + queueCounts.claims
    : queueCounts[queueFilter];

  function submitSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (view === "tools") return;
    const params = new URLSearchParams();
    params.set("league", league);
    params.set("season", season);
    if (query.trim()) params.set("q", query.trim());
    router.push(`/admin/tools?${params.toString()}`);
  }

  function changeLeague(nextLeague: League) {
    const params = new URLSearchParams(searchParams?.toString());
    params.set("league", nextLeague);
    params.set("season", nextLeague === league ? season : defaultSeasons[nextLeague]);
    router.push(`${pathname}?${params.toString()}`);
  }

  function changeSeason(nextSeason: string) {
    const params = new URLSearchParams(searchParams?.toString());
    params.set("league", league);
    params.set("season", nextSeason);
    router.push(`${pathname}?${params.toString()}`);
  }

  function chooseToolFilter(value: string) {
    setToolFilter(value);
    const params = new URLSearchParams(searchParams?.toString());
    if (value === "all") params.delete("category");
    else params.set("category", value);
    const queryString = params.toString();
    router.replace(queryString ? `${pathname}?${queryString}` : pathname, { scroll: false });
  }

  return (
    <div className={styles.console}>
      <div className={styles.workspace}>
        <div className={styles.toolbar}>
          <div className={styles.contextControls} aria-label="Workspace context">
            <div className={styles.leagueSwitch} role="group" aria-label="Choose league">
              <button type="button" onClick={() => changeLeague("premier")} aria-pressed={league === "premier"}>Premier</button>
              <button type="button" onClick={() => changeLeague("academy")} aria-pressed={league === "academy"}>Academy</button>
            </div>
            <span className={styles.contextDivider} aria-hidden="true" />
            <label className={styles.seasonSelect}>
              <span className={styles.visuallyHidden}>Season</span>
              <select value={season} onChange={(event) => changeSeason(event.target.value)} aria-label="Season">
                {[...new Set([season, ...activeSeasonOptions])].map((option) => <option key={option} value={option}>Season {option}</option>)}
              </select>
              <span aria-hidden="true" className={styles.selectChevron}>⌄</span>
            </label>
          </div>
          <form className={styles.toolSearch} role="search" onSubmit={submitSearch}>
            <Icon name="search" size={18} />
            <label className={styles.visuallyHidden} htmlFor="admin-tool-search">Search tools</label>
            <input id="admin-tool-search" ref={inputRef} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search tools…" />
            <kbd>⌘ K</kbd>
          </form>
        </div>

        <div className={styles.scopeNote}>Schedule follows this league and season; homepage editing uses current fixtures, while signup and homepage mode settings are global.</div>

        {view === "overview" ? (
          <>
            <header className={styles.pageHeader}>
              <div>
                <h1>League operations</h1>
                <p>Your next actions, matches and publishing controls.</p>
              </div>
              <div className={styles.headerActions}>
                <span>{today}</span>
                {isFullAdmin ? <Link href={`/admin/tools?league=${league}&season=${encodeURIComponent(season)}`} className={styles.outlineButton}>All tools <span aria-hidden="true">↗</span></Link> : null}
              </div>
            </header>

            {isFullAdmin ? (
              <>
                <div className={styles.statusStrip} aria-label="League status">
                  <div><Icon name="trophy" /><span><strong>{season} · {phase}</strong><small>Current phase</small></span></div>
                <div><Icon name="people" /><span><strong>Signups</strong><small className={settingsAvailable ? (signupsOpen ? styles.statusGood : styles.statusClosed) : undefined}>{settingsAvailable ? (signupsOpen ? "Open" : "Closed") : "Unavailable"}</small></span></div>
                  <div><Icon name="calendar" /><span><strong>{upcomingCount}</strong><small>Upcoming series</small></span></div>
                  <div><Icon name="file" /><span><strong>{canReviewQueues ? (queueUnavailable ? "—" : queueCounts.reports + queueCounts.claims) : "—"}</strong><small>Open reports &amp; claims</small></span></div>
                </div>

                <div className={styles.topGrid}>
                  <section className={styles.attention} aria-labelledby="attention-title">
                    <div className={styles.sectionHeading}>
                      <h2 id="attention-title">Needs attention <span className={styles.count}>{canReviewQueues && !queueUnavailable ? queueCounts.reports + queueCounts.claims : "—"}</span></h2>
                    </div>
                    {canReviewQueues ? (
                      <>
                        <div className={styles.queueTabs} role="group" aria-label="Filter attention queue">
                          {[
                            ["all", "All", queueCounts.reports + queueCounts.claims],
                            ["reports", "Match reports", queueCounts.reports],
                            ["claims", "Player claims", queueCounts.claims],
                          ].map(([id, label, count]) => (
                            <button key={id} type="button" onClick={() => setQueueFilter(id as "all" | QueueType)} aria-pressed={queueFilter === id}>
                              {label}<span>{queueUnavailable ? "—" : count}</span>
                            </button>
                          ))}
                        </div>
                        {queueUnavailable ? (
                          <p className={styles.queueEmpty}>Review queue data is temporarily unavailable.</p>
                        ) : visibleQueueItems.length ? (
                          <div className={styles.queueRows}>
                            {visibleQueueItems.map((item) => (
                              <div className={styles.queueRow} key={item.id}>
                                <span className={styles.rowIcon}><Icon name={item.icon} size={24} /></span>
                                <span className={styles.rowCopy}><strong>{item.title}</strong><small>{item.detail}</small></span>
                                <Link href={item.href} className={styles.rowAction}>{item.action}<span aria-hidden="true">→</span></Link>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <p className={styles.queueEmpty}>{queueFilter === "all" ? "No reports or player claims need review for this league and season." : `No ${queueFilter === "reports" ? "match reports" : "player claims"} need review for this league and season.`}</p>
                        )}
                        {!queueUnavailable ? <div className={styles.queueFooter}>
                          <span>Showing {visibleQueueItems.length} of {activeQueueCount} items</span>
                          <Link href={`/admin/tools?league=${league}&season=${encodeURIComponent(season)}`}>View tools <span aria-hidden="true">→</span></Link>
                        </div> : null}
                      </>
                    ) : <p className={styles.queueEmpty}>Review queues are available to admins.</p>}
                  </section>

                  <aside className={styles.rightColumn}>
                    <section className={styles.broadcast} aria-labelledby="broadcast-title">
                      <div className={styles.broadcastEyebrow} id="broadcast-title">Homepage & broadcast</div>
                      <div className={styles.broadcastMeta}>{league === "academy" ? "Academy" : "Premier"} · {homepageSeason}</div>
                      <div className={styles.broadcastRule} />
                      <div className={styles.featureLabel}>Featured match</div>
                      {featuredMatch ? (
                        <div className={styles.matchup}>
                          <div><span className={styles.crestBlue} aria-hidden="true">◆</span><strong>{featuredMatch.teamA}</strong></div>
                          <span className={styles.vs}>vs</span>
                          <div><span className={styles.crestCoral} aria-hidden="true">◆</span><strong>{featuredMatch.teamB}</strong></div>
                        </div>
                      ) : <p className={styles.noMatch}>No featured matchup selected.</p>}
                      <div className={styles.matchStarts}>{featuredMatch?.starts || "Set a featured match in the editor below"}</div>
                      <div className={styles.broadcastMode}><span>Homepage mode</span><strong>{settingsAvailable ? homepageMode : "Unavailable"}</strong></div>
                      <Link href="/admin/content" className={styles.broadcastButton}>Edit featured matchup</Link>
                    </section>
                    <section className={styles.quickActions} aria-labelledby="quick-actions-title">
                      <h2 id="quick-actions-title">Quick actions</h2>
                  <div className={styles.quickGrid}>
                        <Link href={`/admin/league/schedule?league=${league}&season=${encodeURIComponent(season)}`}><Icon name="calendar" size={18} />Edit fixtures <span aria-hidden="true">→</span></Link>
                        <Link href="/admin/league/signups"><Icon name="people" size={18} />Review signups <span aria-hidden="true">→</span></Link>
                        <Link href={`/admin/league/teams?league=${league}`}><Icon name="shield" size={18} />Manage rosters <span aria-hidden="true">→</span></Link>
                        {canReviewQueues ? <Link href="/admin/claims"><Icon name="people" size={18} />Review player claims <span aria-hidden="true">→</span></Link> : null}
                        {isOwner ? <Link href="/admin/league/drafts"><Icon name="file" size={18} />Open draft room <span aria-hidden="true">→</span></Link> : null}
                      </div>
                    </section>
                  </aside>
                </div>

                <div className={styles.bottomGrid}>
                  <section className={styles.weekSection} aria-labelledby="week-title">
                    <div className={styles.tableHeading}><h2 id="week-title">This week</h2><Link href={`/admin/league/schedule?league=${league}&season=${encodeURIComponent(season)}`}>View schedule <span aria-hidden="true">→</span></Link></div>
                    <div className={styles.scheduleTableWrap}>
                      <table className={styles.scheduleTable}>
                        <thead><tr><th>Match</th><th>Starts</th><th>Status</th></tr></thead>
                        <tbody>
                          {upcoming.length ? upcoming.slice(0, 3).map((row) => (
                            <tr key={row.id}><td>{row.matchup}</td><td>{row.starts}</td><td><span className={`${styles.statusDot} ${row.status === "Completed" ? styles.dotDone : ""}`} />{row.status}</td></tr>
                          )) : <tr><td colSpan={3} className={styles.emptySchedule}>No upcoming series in this season.</td></tr>}
                        </tbody>
                      </table>
                    </div>
                  </section>
                  <section className={styles.activity} aria-labelledby="activity-title">
                    <h2 id="activity-title">Recorded activity</h2>
                    {canReviewQueues && !queueUnavailable && recentActivity.length ? recentActivity.map((item) => (
                      <div className={styles.activityRow} key={item.id}>
                        <Icon name={item.icon} size={20} />
                        <span><strong>{item.title}</strong><small>{item.detail}</small></span>
                        <time dateTime={item.occurredAt}>{item.timeLabel}</time>
                      </div>
                    )) : (
                      <p className={styles.activityEmpty}>{queueUnavailable ? "Activity is temporarily unavailable." : canReviewQueues ? "No recorded report or claim activity in the recent window for this league and season." : "Recorded activity is available to admins."}</p>
                    )}
                  </section>
                </div>
              </>
            ) : (
              <section className={styles.broadcasterWelcome}>
                <span className={styles.workspaceEyebrow}>Broadcast workspace</span>
                <h2>Homepage controls</h2>
                <p>Choose a featured matchup for {league === "academy" ? "Academy" : "Premier"}. Your existing access stays limited to broadcast controls.</p>
                <Link href="/admin/content" className={styles.outlineButton}>Open featured matchup controls <span aria-hidden="true">↓</span></Link>
              </section>
            )}

            <footer className={styles.consoleFooter}><span>FPL / ADMIN</span><span>{isOwner ? "Owner view" : "Staff view"}</span></footer>
          </>
        ) : (
          <>
            <header className={styles.pageHeader}>
              <div><h1>All tools</h1><p>Everything has a place. Find a tool and get to work.</p></div>
              <Link href={`/admin?league=${league}&season=${encodeURIComponent(season)}`} className={styles.outlineButton}><span aria-hidden="true">←</span> Overview</Link>
            </header>
            <nav className={styles.toolFilters} aria-label="Filter tool directory">
              {filterTabs.map((tab) => <button key={tab.id} type="button" aria-pressed={toolFilter === tab.id} onClick={() => chooseToolFilter(tab.id)}>{tab.label}</button>)}
            </nav>

            <div className={styles.directoryLayout}>
              <div className={styles.toolColumns}>
                {visibleColumns.length ? visibleColumns.map((column, index) => (
                  <div className={styles.toolColumn} key={`column-${index}`}>
                    {column.map((group) => (
                      <section className={styles.toolGroup} key={group.number}>
                        <h2><span>{group.number}</span>{group.title}</h2>
                        <div>
                          {group.tools.map((tool) => (
                            <div className={`${styles.toolRow} ${tool.ownerOnly && !isOwner ? styles.restrictedTool : ""}`} key={tool.label}>
                              <Icon name={tool.icon} size={23} />
                              <span><strong>{tool.label}</strong><small>{tool.description}</small></span>
                              {tool.ownerOnly ? <span className={styles.ownerTag}>Owner</span> : null}
                              {tool.ownerOnly && !isOwner ? <span className={styles.lockMark} aria-label="Owner access required">⌑</span> : <Link href={toolHref(tool, league, season)} aria-label={`Open ${tool.label}`}><Icon name="arrow" size={18} /></Link>}
                            </div>
                          ))}
                        </div>
                      </section>
                    ))}
                  </div>
                )) : <div className={styles.noTools}>No tools match this filter.</div>}
              </div>

              <aside className={styles.designLab} id="design-lab" aria-labelledby="design-lab-title">
                <div className={styles.designTitle}><Icon name="flask" size={38} /><div><span>Previews & experiments</span><h2 id="design-lab-title">Design lab</h2></div></div>
                <p>Explore treatments before they ship.</p>
                <div className={styles.designRows}>
                  {visibleDesignTools.map((tool) => (
                    <Link href={tool.href} key={tool.label}>{tool.label}<Icon name="arrow" size={17} /></Link>
                  ))}
                  {visibleDesignTools.length === 0 ? <span className={styles.designEmpty}>Use All tools to browse design previews.</span> : null}
                </div>
                <Link href="/admin/parallels" className={styles.designButton}>Open design lab <span aria-hidden="true">→</span></Link>
                <div className={styles.quieterWorkspace}><strong>A quieter workspace</strong><p>Previews live here, leaving daily operations focused.</p></div>
              </aside>
            </div>
            <footer className={styles.consoleFooter}><span>FPL / ADMIN</span><span>{isOwner ? "Owner view" : "Staff view"}</span></footer>
          </>
        )}
      </div>
    </div>
  );
}
