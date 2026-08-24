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

function percent(post: BangerPost) {
  return `${rating(post)}%`;
}

function VoteButtons({ post, currentVote, onVote }: { post: BangerPost; currentVote?: Vote; onVote: (vote: Vote) => void }) {
  return (
    <div className="flex gap-2" aria-label={`Vote on ${post.text}`}>
      <button
        type="button"
        aria-pressed={currentVote === "stinker"}
        onClick={() => onVote("stinker")}
        className={`rounded-full border px-4 py-2 text-sm font-bold uppercase tracking-[0.12em] transition ${
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
        onClick={() => onVote("mid")}
        className={`rounded-full border px-4 py-2 text-sm font-bold uppercase tracking-[0.12em] transition ${
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
        onClick={() => onVote("banger")}
        className={`rounded-full border px-4 py-2 text-sm font-bold uppercase tracking-[0.12em] transition ${
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

function TweetCard({ post, currentVote, onVote, featured = false }: { post: BangerPost; currentVote?: Vote; onVote: (vote: Vote) => void; featured?: boolean }) {
  return (
    <article className={`group relative overflow-hidden rounded-2xl border bg-jungle-card/90 p-5 transition hover:-translate-y-0.5 hover:border-banana/60 ${featured ? "border-banana/50 shadow-[0_14px_50px_rgba(0,0,0,0.3)]" : "border-white/10"}`}>
      <div className="absolute right-4 top-4 text-2xl opacity-60 transition group-hover:rotate-12 group-hover:opacity-100" aria-hidden="true">🍌</div>
      <div className="mb-5 pr-10"><TweetIdentity date={formatPostDate(post.publishedAt)} /></div>
      <p className={`${featured ? "text-xl sm:text-2xl" : "text-lg"} max-w-2xl font-medium leading-snug text-white/90`}>
        {post.text}
      </p>
      <div className="mt-7 flex flex-wrap items-center justify-between gap-4 border-t border-white/10 pt-4">
        <div className="flex gap-4 text-xs text-white/35" aria-label="Tweet engagement">
          <span>↩ {post.replies ?? 0}</span><span>↻ {post.reposts ?? 0}</span><span>♡ {post.likes ?? 0}</span>
        </div>
        <VoteButtons post={post} currentVote={currentVote} onVote={onVote} />
      </div>
      <div className="mt-4 flex items-center gap-3">
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/10"><div className="h-full rounded-full bg-banana transition-all" style={{ width: percent(post) }} /></div>
        <span className="font-mono text-xs font-bold text-banana">{percent(post)} BANGER</span>
      </div>
      <Link href={post.url} target="_blank" rel="noopener noreferrer" className="mt-3 inline-block text-[0.62rem] uppercase tracking-[0.18em] text-white/35 hover:text-banana">View on X ↗</Link>
    </article>
  );
}

export default function BangerBoard({ posts, dailyBanger, settings, initialVotes = {}, initialDailyVote }: { posts: BangerPost[]; dailyBanger: (BangerPost & { checkDate: string; startsAt: string; endsAt: string }) | null; settings: BangerBoardSettings; initialVotes?: Partial<Record<string, Vote>>; initialDailyVote?: Vote }) {
  const [votes, setVotes] = useState<Record<string, Vote | undefined>>(initialVotes);
  const [randomPostId, setRandomPostId] = useState<string | undefined>(undefined);
  const [dailyVote, setDailyVote] = useState<Vote | undefined>(initialDailyVote);
  const [dailyMessage, setDailyMessage] = useState("");
  const votedPosts = useMemo(() => posts.map((post) => withVotes(post, votes, initialVotes)), [posts, votes, initialVotes]);
  const recentPosts = useMemo(() => getRecentPosts(votedPosts), [votedPosts]);
  const rankedPosts = useMemo(() => getTopPosts(votedPosts), [votedPosts]);
  const stinkerPosts = useMemo(() => getStinkerPosts(votedPosts), [votedPosts]);
  const randomPost = useMemo(() => votedPosts.find((post) => post.id === randomPostId), [randomPostId, votedPosts]);

  useEffect(() => {
    if ((!randomPostId || !posts.some((post) => post.id === randomPostId)) && posts.length > 0) {
      setRandomPostId(pickRandomPost(posts)?.id);
    }
  }, [posts, randomPostId]);

  async function vote(id: string, nextVote: Vote) {
    const previousVote = votes[id];
    setVotes((current) => ({ ...current, [id]: nextVote }));
    const result = await voteBangerPost(id, nextVote);
    if (!result.ok) setVotes((current) => ({ ...current, [id]: previousVote }));
  }

  async function voteDaily(nextVote: Vote) {
    if (!dailyBanger || dailyVote) return;
    setDailyVote(nextVote);
    const result = await voteDailyBanger(dailyBanger.id, nextVote);
    setDailyMessage(result.ok ? (result.alreadyVoted ? "You already voted today." : "Vote locked in — $100 added to your wallet.") : result.error);
    if (!result.ok) setDailyVote(undefined);
  }

  return (
    <main className="min-h-screen overflow-hidden bg-jungle bg-hash">
      <section className="relative border-b border-banana/20 px-5 pb-14 pt-14 sm:px-10 sm:pt-20">
        <div className="pointer-events-none absolute -right-8 -top-8 text-[10rem] opacity-[0.08] sm:text-[16rem]" aria-hidden="true">🐒</div>
        <div className="mx-auto max-w-6xl">
          <div className="mb-6 flex items-center gap-3 text-xs font-bold uppercase tracking-[0.24em] text-banana"><span className="text-lg">🍌</span> Premium dispatch · the banger board</div>
          <div className="grid gap-10 lg:grid-cols-[1.1fr_0.9fr] lg:items-end">
            <div>
              <h1 className="max-w-3xl font-display text-5xl font-bold uppercase italic leading-[0.9] tracking-[-0.05em] text-white sm:text-7xl">{settings.heroTitle}</h1>
              <p className="mt-6 max-w-xl text-lg leading-relaxed text-white/60">The community court for the takes, theories, and timeline turbulence of <span className="font-semibold text-white">@Stuart69Davis</span>.</p>
              <div className="mt-8 flex flex-wrap items-center gap-4"><a href="https://x.com/Stuart69Davis" target="_blank" rel="noopener noreferrer" className="rounded-full bg-banana px-5 py-3 text-xs font-bold uppercase tracking-[0.16em] text-jungle transition hover:bg-white">Open X profile ↗</a><span className="text-xs uppercase tracking-[0.16em] text-white/35">{posts.length} archived transmissions</span></div>
            </div>
            <div className="rounded-2xl border border-banana/30 bg-jungle-card/80 p-6 shadow-[0_20px_60px_rgba(0,0,0,0.25)]">
              <div className="flex items-center justify-between"><span className="text-xs font-bold uppercase tracking-[0.2em] text-white/45">Overall jungle verdict</span><span className="text-2xl">🏆</span></div>
              <div className="mt-3 flex items-end gap-3"><span className="font-display text-6xl font-bold italic text-banana">—</span><span className="pb-2 text-sm text-white/45">no votes yet</span></div>
              <div className="mt-4 h-2 overflow-hidden rounded-full bg-white/10"><div className="h-full w-0 rounded-full bg-gradient-to-r from-coral via-banana to-mint" /></div>
              <p className="mt-3 text-sm text-white/45">The canopy opens when verified posts arrive and the community starts voting.</p>
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-5 pt-12 sm:px-10">
        <div className="rounded-3xl border border-mint/30 bg-gradient-to-br from-[#173b2c] to-jungle-card p-6 shadow-[0_18px_50px_rgba(0,0,0,0.25)] sm:p-8">
          <div className="flex flex-wrap items-start justify-between gap-4"><div><p className="label-dash">Daily reward · rotates every 24h UTC</p><h2 className="mt-2 font-display text-3xl font-bold uppercase italic text-white sm:text-4xl">{settings.dailyTitle}</h2></div><span className="text-4xl">🎁 🍌</span></div>
          {dailyBanger ? <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_auto] lg:items-end"><div><TweetIdentity date={formatPostDate(dailyBanger.publishedAt)} /><p className="mt-4 max-w-3xl text-xl leading-snug text-white/85">{dailyBanger.text}</p></div><div>{dailyVote ? <p className="mb-3 text-xs font-bold uppercase tracking-[0.16em] text-mint">✓ Bonus claimed</p> : <p className="mb-3 text-xs font-bold uppercase tracking-[0.16em] text-mint">Vote once today · get $100</p>}<VoteButtons post={dailyBanger} currentVote={dailyVote} onVote={voteDaily} /><p className="mt-3 text-xs text-white/45">{dailyMessage || `Refreshes ${new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", timeZone: "UTC" }).format(new Date(dailyBanger.endsAt))} UTC`}</p></div></div> : <p className="mt-6 text-sm text-white/50">No verified tweets are available for today&apos;s check yet.</p>}
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-5 py-12 sm:px-10">
        <div className="mb-6 flex items-end justify-between gap-4"><div><p className="label-dash">The podium</p><h2 className="mt-2 font-display text-3xl font-bold uppercase italic text-white sm:text-4xl">{settings.podiumTitle}</h2></div><span className="hidden text-4xl sm:block">🍌 🐒 🍌</span></div>
        <div className="grid gap-4 lg:grid-cols-3">{rankedPosts.length > 0 ? rankedPosts.map((post, index) => <div key={post.id} className={`${index === 0 ? "lg:-translate-y-3" : ""} rounded-2xl border border-white/10 bg-jungle-card/70 p-4`}><div className="mb-3 flex items-center justify-between"><span className={`flex h-8 w-8 items-center justify-center rounded-full font-display text-lg font-bold ${index === 0 ? "bg-banana text-jungle" : "bg-white/10 text-white/60"}`}>{index + 1}</span><span className="text-xs font-bold uppercase tracking-[0.15em] text-banana">{percent(post)} banger</span></div><TweetIdentity compact date={formatPostDate(post.publishedAt)} /><p className="mt-3 min-h-16 text-sm leading-relaxed text-white/75">{post.text}</p></div>) : <div className="rounded-2xl border border-dashed border-banana/30 bg-jungle-card/40 p-6 text-sm text-white/50 lg:col-span-3">No community ratings yet.</div>}</div>
      </section>

      <section className="mx-auto max-w-6xl px-5 pb-12 sm:px-10">
        <div className="mb-6 flex items-end justify-between gap-4"><div><p className="label-dash">The basement</p><h2 className="mt-2 font-display text-3xl font-bold uppercase italic text-white sm:text-4xl">{settings.stinkerTitle}</h2></div><span className="text-4xl">💩 🐒 💩</span></div>
        <div className="grid gap-4 lg:grid-cols-3">{stinkerPosts.length > 0 ? stinkerPosts.map((post, index) => <div key={post.id} className="rounded-2xl border border-purple-300/20 bg-jungle-card/70 p-4"><div className="mb-3 flex items-center justify-between"><span className="flex h-8 w-8 items-center justify-center rounded-full bg-purple-300/20 font-display text-lg font-bold text-purple-200">{index + 1}</span><span className="text-xs font-bold uppercase tracking-[0.15em] text-purple-200">{stinkerRating(post)}% stinker</span></div><TweetIdentity compact date={formatPostDate(post.publishedAt)} /><p className="mt-3 min-h-16 text-sm leading-relaxed text-white/75">{post.text}</p></div>) : <div className="rounded-2xl border border-dashed border-purple-300/30 bg-jungle-card/40 p-6 text-sm text-white/50 lg:col-span-3">No community stinkers yet.</div>}</div>
      </section>

      <section className="mx-auto flex max-w-6xl flex-col gap-12 px-5 pb-16 sm:px-10">
        <div className="order-1"><div className="mb-6 flex items-end justify-between gap-4"><div><p className="label-dash">The current canopy</p><h2 className="mt-2 font-display text-3xl font-bold uppercase italic text-white sm:text-4xl">{settings.recentTitle}</h2></div><span className="text-xs uppercase tracking-[0.15em] text-white/35">{recentPosts.length} transmissions</span></div><div className="space-y-4">{recentPosts.length > 0 ? recentPosts.map((post) => <TweetCard key={post.id} post={post} currentVote={votes[post.id]} onVote={(nextVote) => vote(post.id, nextVote)} featured={post.id === recentPosts[0].id} />) : <div className="rounded-2xl border border-dashed border-banana/30 bg-jungle-card/40 p-6 text-sm leading-relaxed text-white/50">No verified tweets from the last 45 days yet. This feed will stay empty rather than display invented posts.</div>}</div></div>
        <div className="order-2 relative overflow-hidden rounded-3xl border border-coral/40 bg-gradient-to-br from-[#173b2c] to-jungle-card p-6 shadow-[0_18px_50px_rgba(0,0,0,0.25)]"><div className="absolute -right-4 -top-8 text-8xl opacity-30" aria-hidden="true">🍌</div><p className="label-dash">From the archive</p><h2 className="mt-3 font-display text-3xl font-bold uppercase italic text-white">{settings.randomTitle}</h2><div className="mt-7 rounded-2xl border border-white/10 bg-jungle/60 p-4">{randomPost ? <><TweetIdentity date={formatPostDate(randomPost.publishedAt)} /><p className="mt-4 text-lg leading-snug text-white/85">{randomPost.text}</p><div className="mt-5"><VoteButtons post={randomPost} currentVote={votes[randomPost.id]} onVote={(nextVote) => vote(randomPost.id, nextVote)} /></div><div className="mt-3 text-xs font-bold uppercase tracking-[0.15em] text-banana">{percent(randomPost)} banger rating</div></> : <p className="text-sm leading-relaxed text-white/45">The all-time verified archive is empty. Random pulls will unlock when real posts are connected.</p>}</div><button type="button" onClick={() => setRandomPostId(pickRandomPost(posts)?.id)} disabled={posts.length === 0} className="mt-5 w-full rounded-full border border-coral/70 px-4 py-3 text-xs font-bold uppercase tracking-[0.18em] text-coral transition hover:bg-coral hover:text-jungle disabled:cursor-not-allowed disabled:opacity-40">{posts.length === 0 ? "Awaiting verified posts" : "Pull another banana ↻"}</button></div>
      </section>
    </main>
  );
}
