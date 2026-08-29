"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { voteBangerPost, voteDailyBanger, type BangerVote } from "@/lib/bangers/actions";
import type { BangerBoardSettings } from "@/lib/bangers/settings";
import TweetIdentity from "./TweetIdentity";
import {
  getRecentPosts,
  getStinkerPosts,
  getTopPosts,
  formatPostDate,
  pickRandomPost,
  rating,
  stinkerRating,
  type BangerPost,
} from "@/lib/bangers/feed";
import BangerMeter from "./BangerMeter";

type Vote = BangerVote;

function withVotes(post: BangerPost, votes: Partial<Record<string, Vote>>, savedVotes: Partial<Record<string, Vote>>) {
  const vote = votes[post.id];
  const savedVote = savedVotes[post.id];
  if (!vote || vote === savedVote) return post;
  return {
    ...post,
    bangerVotes: post.bangerVotes - (savedVote === "banger" ? 1 : 0) + (vote === "banger" ? 1 : 0),
    midVotes: post.midVotes - (savedVote === "mid" ? 1 : 0) + (vote === "mid" ? 1 : 0),
    stinkerVotes: post.stinkerVotes - (savedVote === "stinker" ? 1 : 0) + (vote === "stinker" ? 1 : 0),
  };
}

function totalVotes(post: BangerPost) {
  return post.bangerVotes + post.midVotes + post.stinkerVotes;
}

function VoteButtons({ post, currentVote, onVote, disabled = false }: { post: BangerPost; currentVote?: Vote; onVote: (vote: Vote) => void; disabled?: boolean }) {
  return (
    <div className="flex flex-wrap gap-2" role="group" aria-label={`Vote on ${post.text}`}>
      <button
        type="button"
        aria-pressed={currentVote === "stinker"}
        disabled={disabled}
        onClick={() => onVote("stinker")}
        className={`rounded-full border px-4 py-2 text-sm font-bold uppercase tracking-[0.12em] transition disabled:cursor-wait disabled:opacity-50 ${
          currentVote === "stinker"
            ? "border-red-400 bg-red-500 text-white shadow-[0_0_18px_rgba(239,68,68,0.35)]"
            : "border-red-400/40 text-red-200 hover:bg-red-500/20 hover:text-red-100"
        }`}
      >
        💩 Stinker
      </button>
      <button
        type="button"
        aria-pressed={currentVote === "mid"}
        disabled={disabled}
        onClick={() => onVote("mid")}
        className={`rounded-full border px-4 py-2 text-sm font-bold uppercase tracking-[0.12em] transition disabled:cursor-wait disabled:opacity-50 ${
          currentVote === "mid"
            ? "border-blue-400 bg-blue-500 text-white shadow-[0_0_18px_rgba(59,130,246,0.35)]"
            : "border-blue-400/40 text-blue-200 hover:bg-blue-500/20 hover:text-blue-100"
        }`}
      >
        😐 Mid
      </button>
      <button
        type="button"
        aria-pressed={currentVote === "banger"}
        disabled={disabled}
        onClick={() => onVote("banger")}
        className={`rounded-full border px-4 py-2 text-sm font-bold uppercase tracking-[0.12em] transition disabled:cursor-wait disabled:opacity-50 ${
          currentVote === "banger"
            ? "border-yellow-300 bg-yellow-400 text-jungle shadow-[0_0_18px_rgba(250,204,21,0.35)]"
            : "border-yellow-300/40 text-yellow-200 hover:bg-yellow-400/20 hover:text-yellow-100"
        }`}
      >
        🍌 Banger
      </button>
    </div>
  );
}

function TweetCard({ post, currentVote, onVote, votePending = false, voteMessage, featured = false }: { post: BangerPost; currentVote?: Vote; onVote: (vote: Vote) => void; votePending?: boolean; voteMessage?: string; featured?: boolean }) {
  const hasEngagement = post.replies !== undefined || post.reposts !== undefined || post.likes !== undefined;
  return (
    <article className={`group relative overflow-hidden rounded-2xl border bg-jungle-card/90 p-5 transition hover:-translate-y-0.5 hover:border-banana/60 ${featured ? "border-banana/50 shadow-[0_14px_50px_rgba(0,0,0,0.3)]" : "border-white/10"}`}>
      <div className="absolute right-4 top-4 text-2xl opacity-60 transition group-hover:rotate-12 group-hover:opacity-100" aria-hidden="true">🍌</div>
      <div className="mb-5 pr-10"><TweetIdentity date={formatPostDate(post.publishedAt)} /></div>
      <p className={`${featured ? "text-xl sm:text-2xl" : "text-lg"} max-w-2xl font-medium leading-snug text-white/90`}>
        {post.text}
      </p>
      <div className="mt-7 flex flex-wrap items-center justify-between gap-4 border-t border-white/10 pt-4">
        {hasEngagement ? <div className="flex gap-4 text-xs text-white/35" aria-label="Tweet engagement">
          {post.replies !== undefined ? <span>↩ {post.replies}</span> : null}
          {post.reposts !== undefined ? <span>↻ {post.reposts}</span> : null}
          {post.likes !== undefined ? <span>♡ {post.likes}</span> : null}
        </div> : null}
        <VoteButtons post={post} currentVote={currentVote} onVote={onVote} disabled={votePending} />
      </div>
      {voteMessage ? <p className="mt-3 text-xs text-white/60" role="status" aria-live="polite">{voteMessage}</p> : null}
      <BangerMeter score={rating(post)} voteCount={totalVotes(post)} className="mt-4" />
      <Link href={post.url} target="_blank" rel="noopener noreferrer" className="mt-3 inline-block text-[0.62rem] uppercase tracking-[0.18em] text-white/35 hover:text-banana">View on X ↗</Link>
    </article>
  );
}

function LocalResetTime({ endsAt }: { endsAt: string }) {
  const [resetLabel, setResetLabel] = useState<string | null>(null);

  useEffect(() => {
    // Client-only formatting keeps server HTML and hydrated HTML identical.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setResetLabel(
      new Intl.DateTimeFormat(undefined, {
        hour: "numeric",
        minute: "2-digit",
        timeZoneName: "short",
      }).format(new Date(endsAt)),
    );
  }, [endsAt]);

  return <p className="mt-3 text-xs text-white/45">{resetLabel ? `Resets ${resetLabel}` : "Resets at your local time"}</p>;
}

export default function BangerBoard({ posts, dailyBanger, settings, initialVotes = {}, initialDailyVote }: { posts: BangerPost[]; dailyBanger: (BangerPost & { checkDate: string; startsAt: string; endsAt: string }) | null; settings: BangerBoardSettings; initialVotes?: Partial<Record<string, Vote>>; initialDailyVote?: Vote }) {
  const [votes, setVotes] = useState<Record<string, Vote | undefined>>(initialVotes);
  const [randomPostId, setRandomPostId] = useState<string | undefined>(undefined);
  const [dailyVote, setDailyVote] = useState<Vote | undefined>(initialDailyVote);
  const [dailyMessage, setDailyMessage] = useState("");
  const [dailyPending, setDailyPending] = useState(false);
  const [pendingPostIds, setPendingPostIds] = useState<Set<string>>(() => new Set());
  const [voteMessages, setVoteMessages] = useState<Record<string, string | undefined>>({});
  const dailyPostId = dailyBanger?.id;
  const dailyOverlapsRecent = Boolean(dailyPostId && posts.some((post) => post.id === dailyPostId));
  const displayVotes = useMemo(() => {
    if (!dailyOverlapsRecent || !dailyPostId || !dailyVote) return votes;
    return { ...votes, [dailyPostId]: dailyVote };
  }, [dailyOverlapsRecent, dailyPostId, dailyVote, votes]);
  const votedPosts = useMemo(() => posts.map((post) => withVotes(post, displayVotes, initialVotes)), [posts, displayVotes, initialVotes]);
  const recentPosts = useMemo(() => getRecentPosts(votedPosts), [votedPosts]);
  const rankedPosts = useMemo(() => getTopPosts(votedPosts), [votedPosts]);
  const stinkerPosts = useMemo(() => getStinkerPosts(votedPosts), [votedPosts]);
  const randomPost = useMemo(() => votedPosts.find((post) => post.id === randomPostId), [randomPostId, votedPosts]);
  const dailyDisplayPost = useMemo(() => {
    if (!dailyBanger) return undefined;
    return withVotes(
      dailyBanger,
      { [dailyBanger.id]: dailyVote },
      { [dailyBanger.id]: initialDailyVote },
    );
  }, [dailyBanger, dailyVote, initialDailyVote]);
  const dailyDisplayVote = dailyBanger
    ? (dailyOverlapsRecent ? dailyVote ?? votes[dailyBanger.id] : dailyVote)
    : undefined;
  const overallVoteCount = useMemo(() => votedPosts.reduce((total, post) => total + post.bangerVotes + post.midVotes + post.stinkerVotes, 0), [votedPosts]);
  const overallBangerVotes = useMemo(() => votedPosts.reduce((total, post) => total + post.bangerVotes, 0), [votedPosts]);
  const overallRating = overallVoteCount === 0 ? 0 : Math.round((overallBangerVotes / overallVoteCount) * 100);

  useEffect(() => {
    if ((!randomPostId || !posts.some((post) => post.id === randomPostId)) && posts.length > 0) {
      // Client-only on purpose: rolling the random pull during render would
      // make the server's pick disagree with the client's and fail hydration,
      // so the initial pick (and a re-pick when the current one leaves the
      // feed) has to happen in an effect. Rerolls stay event-driven below.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setRandomPostId(pickRandomPost(posts)?.id);
    }
  }, [posts, randomPostId]);

  function isVoteLocked(id: string) {
    return pendingPostIds.has(id) || (dailyOverlapsRecent && id === dailyPostId && Boolean(dailyVote));
  }

  async function vote(id: string, nextVote: Vote) {
    if (isVoteLocked(id)) return;
    const previousVote = votes[id];
    setVotes((current) => ({ ...current, [id]: nextVote }));
    setVoteMessages((current) => ({ ...current, [id]: undefined }));
    setPendingPostIds((current) => new Set(current).add(id));
    try {
      const result = await voteBangerPost(id, nextVote);
      if (result.ok) {
        setVoteMessages((current) => ({ ...current, [id]: "Vote saved." }));
      } else {
        setVotes((current) => ({ ...current, [id]: previousVote }));
        setVoteMessages((current) => ({ ...current, [id]: result.error }));
      }
    } catch {
      setVotes((current) => ({ ...current, [id]: previousVote }));
      setVoteMessages((current) => ({ ...current, [id]: "That vote could not be saved." }));
    } finally {
      setPendingPostIds((current) => {
        const next = new Set(current);
        next.delete(id);
        return next;
      });
    }
  }

  async function voteDaily(nextVote: Vote) {
    if (!dailyBanger || dailyVote || dailyPending) return;
    setDailyVote(nextVote);
    setDailyPending(true);
    setDailyMessage("Saving vote…");
    try {
      const result = await voteDailyBanger(dailyBanger.id, nextVote);
      setDailyMessage(result.ok ? (result.alreadyVoted ? "You already voted today." : "Vote locked in — $200 added to your wallet.") : result.error);
      if (!result.ok) setDailyVote(undefined);
    } catch {
      setDailyVote(undefined);
      setDailyMessage("That vote could not be saved.");
    } finally {
      setDailyPending(false);
    }
  }

  return (
    <main className="min-h-screen overflow-hidden bg-jungle bg-hash">
      <section className="relative border-b border-banana/20 px-5 pb-14 pt-14 sm:px-10 sm:pt-20">
        <div className="pointer-events-none absolute -right-8 -top-8 text-[10rem] opacity-[0.08] sm:text-[16rem]" aria-hidden="true">🐒</div>
        <div className="mx-auto max-w-6xl">
          <div className="mb-6 flex items-center gap-3 text-xs font-bold uppercase tracking-[0.24em] text-banana"><span className="text-lg">🍌</span> Premium dispatch · The Daily Stu</div>
          <div className="grid gap-10 lg:grid-cols-[1.1fr_0.9fr] lg:items-end">
            <div>
              <h1 className="max-w-3xl font-display text-5xl font-bold uppercase italic leading-[0.9] tracking-[-0.05em] text-white sm:text-7xl">{settings.heroTitle}</h1>
              <p className="mt-6 max-w-xl text-lg leading-relaxed text-white/60">The community court for the takes, theories, and timeline turbulence of <span className="font-semibold text-white">@Stuart69Davis</span>.</p>
              <div className="mt-8 flex flex-wrap items-center gap-4"><a href="https://x.com/Stuart69Davis" target="_blank" rel="noopener noreferrer" className="rounded-full bg-banana px-5 py-3 text-xs font-bold uppercase tracking-[0.16em] text-jungle transition hover:bg-white">Open X profile ↗</a><span className="text-xs uppercase tracking-[0.16em] text-white/35">{posts.length} archived transmissions</span></div>
            </div>
            <div className="rounded-2xl border border-banana/30 bg-jungle-card/80 p-6 shadow-[0_20px_60px_rgba(0,0,0,0.25)]">
              <div className="flex items-center justify-between"><span className="text-xs font-bold uppercase tracking-[0.2em] text-white/45">Overall jungle verdict</span><span className="text-2xl">🏆</span></div>
              <BangerMeter score={overallRating} voteCount={overallVoteCount} detail={overallVoteCount > 0 ? `${overallVoteCount} vote${overallVoteCount === 1 ? "" : "s"} cast` : undefined} className="mt-4" />
              <p className="mt-3 text-sm text-white/45">{overallVoteCount > 0 ? "The banger share across every archived community vote." : "The canopy opens when verified posts arrive and the community starts voting."}</p>
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-5 pt-12 sm:px-10">
        <div className="rounded-3xl border border-mint/30 bg-gradient-to-br from-[#173b2c] to-jungle-card p-6 shadow-[0_18px_50px_rgba(0,0,0,0.25)] sm:p-8">
          <div className="flex flex-wrap items-start justify-between gap-4"><div><p className="label-dash">Daily reward · vote once a day for $200</p><h2 className="mt-2 font-display text-3xl font-bold uppercase italic text-white sm:text-4xl">{settings.dailyTitle}</h2></div><span className="text-4xl">🎁 🍌</span></div>
          {dailyBanger && dailyDisplayPost ? <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_auto] lg:items-end"><div><TweetIdentity date={formatPostDate(dailyDisplayPost.publishedAt)} /><p className="mt-4 max-w-3xl text-xl leading-snug text-white/85">{dailyDisplayPost.text}</p><BangerMeter score={rating(dailyDisplayPost)} voteCount={totalVotes(dailyDisplayPost)} className="mt-5 max-w-xl" /></div><div>{dailyVote ? <p className="mb-3 text-xs font-bold uppercase tracking-[0.16em] text-mint">{dailyPending ? "Saving vote…" : "✓ $200 bonus claimed"}</p> : <p className="mb-3 text-xs font-bold uppercase tracking-[0.16em] text-mint">Vote once a day → get $200</p>}<VoteButtons post={dailyDisplayPost} currentVote={dailyDisplayVote} onVote={voteDaily} disabled={dailyPending || Boolean(dailyVote)} />{dailyMessage ? <p className="mt-3 text-xs text-white/45" role="status" aria-live="polite">{dailyMessage}</p> : null}<LocalResetTime endsAt={dailyBanger.endsAt} /></div></div> : <p className="mt-6 text-sm text-white/50">No verified tweets are available for today&apos;s check yet.</p>}
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-5 py-12 sm:px-10">
        <div className="mb-6 flex items-end justify-between gap-4"><div><p className="label-dash">The podium</p><h2 className="mt-2 font-display text-3xl font-bold uppercase italic text-white sm:text-4xl">{settings.podiumTitle}</h2></div><span className="hidden text-4xl sm:block">🍌 🐒 🍌</span></div>
        <div className="grid gap-4 lg:grid-cols-3">{rankedPosts.length > 0 ? rankedPosts.map((post, index) => <div key={post.id} className={`${index === 0 ? "lg:-translate-y-3" : ""} rounded-2xl border border-white/10 bg-jungle-card/70 p-4`}><div className="mb-3 flex items-center justify-between"><span className={`flex h-8 w-8 items-center justify-center rounded-full font-display text-lg font-bold ${index === 0 ? "bg-banana text-jungle" : "bg-white/10 text-white/60"}`}>{index + 1}</span></div><TweetIdentity compact date={formatPostDate(post.publishedAt)} /><p className="mt-3 min-h-16 text-sm leading-relaxed text-white/75">{post.text}</p><BangerMeter score={rating(post)} voteCount={totalVotes(post)} compact className="mt-3" /></div>) : <div className="rounded-2xl border border-dashed border-banana/30 bg-jungle-card/40 p-6 text-sm text-white/50 lg:col-span-3">No community ratings yet.</div>}</div>
      </section>

      <section className="mx-auto max-w-6xl px-5 pb-12 sm:px-10">
        <div className="mb-6 flex items-end justify-between gap-4"><div><p className="label-dash">The basement</p><h2 className="mt-2 font-display text-3xl font-bold uppercase italic text-white sm:text-4xl">{settings.stinkerTitle}</h2></div><span className="text-4xl">💩 🐒 💩</span></div>
        <div className="grid gap-4 lg:grid-cols-3">{stinkerPosts.length > 0 ? stinkerPosts.map((post, index) => <div key={post.id} className="rounded-2xl border border-purple-300/20 bg-jungle-card/70 p-4"><div className="mb-3 flex items-center justify-between"><span className="flex h-8 w-8 items-center justify-center rounded-full bg-purple-300/20 font-display text-lg font-bold text-purple-200">{index + 1}</span><span className="text-xs font-bold uppercase tracking-[0.15em] text-purple-200">{stinkerRating(post)}% stinker</span></div><TweetIdentity compact date={formatPostDate(post.publishedAt)} /><p className="mt-3 min-h-16 text-sm leading-relaxed text-white/75">{post.text}</p></div>) : <div className="rounded-2xl border border-dashed border-purple-300/30 bg-jungle-card/40 p-6 text-sm text-white/50 lg:col-span-3">No community stinkers yet.</div>}</div>
      </section>

      <section className="mx-auto flex max-w-6xl flex-col gap-12 px-5 pb-16 sm:px-10">
        <div className="order-1"><div className="mb-6 flex items-end justify-between gap-4"><div><p className="label-dash">The current canopy</p><h2 className="mt-2 font-display text-3xl font-bold uppercase italic text-white sm:text-4xl">{settings.recentTitle}</h2></div><span className="text-xs uppercase tracking-[0.15em] text-white/35">{recentPosts.length} transmissions</span></div><div className="space-y-4">{recentPosts.length > 0 ? recentPosts.map((post) => <TweetCard key={post.id} post={post} currentVote={displayVotes[post.id]} onVote={(nextVote) => vote(post.id, nextVote)} votePending={isVoteLocked(post.id)} voteMessage={voteMessages[post.id]} featured={post.id === recentPosts[0].id} />) : <div className="rounded-2xl border border-dashed border-banana/30 bg-jungle-card/40 p-6 text-sm leading-relaxed text-white/50">No verified tweets from the last 45 days yet. This feed will stay empty rather than display invented posts.</div>}</div></div>
        <div className="order-2 relative overflow-hidden rounded-3xl border border-coral/40 bg-gradient-to-br from-[#173b2c] to-jungle-card p-6 shadow-[0_18px_50px_rgba(0,0,0,0.25)]"><div className="absolute -right-4 -top-8 text-8xl opacity-30" aria-hidden="true">🍌</div><p className="label-dash">From the archive</p><h2 className="mt-3 font-display text-3xl font-bold uppercase italic text-white">{settings.randomTitle}</h2><div className="mt-7 rounded-2xl border border-white/10 bg-jungle/60 p-4">{randomPost ? <><TweetIdentity date={formatPostDate(randomPost.publishedAt)} /><p className="mt-4 text-lg leading-snug text-white/85">{randomPost.text}</p><div className="mt-5"><VoteButtons post={randomPost} currentVote={displayVotes[randomPost.id]} onVote={(nextVote) => vote(randomPost.id, nextVote)} disabled={isVoteLocked(randomPost.id)} /></div>{voteMessages[randomPost.id] ? <p className="mt-3 text-xs text-white/60" role="status" aria-live="polite">{voteMessages[randomPost.id]}</p> : null}<BangerMeter score={rating(randomPost)} voteCount={totalVotes(randomPost)} compact className="mt-3" /></> : <p className="text-sm leading-relaxed text-white/45">The all-time verified archive is empty. Random pulls will unlock when real posts are connected.</p>}</div><button type="button" onClick={() => setRandomPostId(pickRandomPost(posts)?.id)} disabled={posts.length === 0} className="mt-5 w-full rounded-full border border-coral/70 px-4 py-3 text-xs font-bold uppercase tracking-[0.18em] text-coral transition hover:bg-coral hover:text-jungle disabled:cursor-not-allowed disabled:opacity-40">{posts.length === 0 ? "Awaiting verified posts" : "Pull another banana ↻"}</button></div>
      </section>
    </main>
  );
}
