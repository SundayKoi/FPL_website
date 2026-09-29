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
import { DAILY_STU_REWARD_SENTENCE } from "@/lib/betting/daily";
import styles from "./BangerBoard.module.css";

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
        className={`${styles.voteButton} ${currentVote === "stinker" ? styles.stinkerSelected : ""}`} data-vote="stinker"
      >
        Stinker
      </button>
      <button
        type="button"
        aria-pressed={currentVote === "mid"}
        disabled={disabled}
        onClick={() => onVote("mid")}
        className={`${styles.voteButton} ${currentVote === "mid" ? styles.midSelected : ""}`} data-vote="mid"
      >
        Mid
      </button>
      <button
        type="button"
        aria-pressed={currentVote === "banger"}
        disabled={disabled}
        onClick={() => onVote("banger")}
        className={`${styles.voteButton} ${currentVote === "banger" ? styles.bangerSelected : ""}`} data-vote="banger"
      >
        Banger
      </button>
    </div>
  );
}

function TweetCard({ post, currentVote, onVote, votePending = false, voteMessage, featured = false }: { post: BangerPost; currentVote?: Vote; onVote: (vote: Vote) => void; votePending?: boolean; voteMessage?: string; featured?: boolean }) {
  const hasEngagement = post.replies !== undefined || post.reposts !== undefined || post.likes !== undefined;
  return (
    <article className={`${styles.post} ${featured ? styles.featuredPost : ""}`}>
      <div className="mb-5"><TweetIdentity date={formatPostDate(post.publishedAt)} /></div>
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
      <Link href={post.url} target="_blank" rel="noopener noreferrer" className="mt-3 inline-block text-[0.62rem] uppercase tracking-[0.18em] text-white/35 hover:text-action-text">View on X ↗</Link>
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

  return <p className="mt-3 text-xs text-muted">{resetLabel ? `Resets midnight UTC · ${resetLabel} for you` : "Resets at midnight UTC"}</p>;
}

export default function BangerBoard({ posts, dailyBanger, settings, patron = false, initialVotes = {}, initialDailyVote, initialDailyRewardAmount }: { posts: BangerPost[]; dailyBanger: (BangerPost & { checkDate: string; startsAt: string; endsAt: string }) | null; settings: BangerBoardSettings; patron?: boolean; initialVotes?: Partial<Record<string, Vote>>; initialDailyVote?: Vote; initialDailyRewardAmount?: number }) {
  const [votes, setVotes] = useState<Record<string, Vote | undefined>>(initialVotes);
  const [randomPostId, setRandomPostId] = useState<string | undefined>(undefined);
  const [dailyVote, setDailyVote] = useState<Vote | undefined>(initialDailyVote);
  const [dailyRewardAmount, setDailyRewardAmount] = useState<number | undefined>(initialDailyRewardAmount);
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
  const listedDailyReward = patron ? 300 : 200;

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
      if (result.ok && result.rewardAmount !== undefined) setDailyRewardAmount(result.rewardAmount);
      setDailyMessage(result.ok ? (result.alreadyVoted ? "You already voted today." : result.rewardAmount ? `Vote locked in — $${result.rewardAmount} added to your wallet.` : "Vote locked in — reward added to your wallet.") : result.error);
      if (!result.ok) setDailyVote(undefined);
    } catch {
      setDailyVote(undefined);
      setDailyMessage("That vote could not be saved.");
    } finally {
      setDailyPending(false);
    }
  }

  return (
    <main className={styles.board}>
      <header className={styles.hero}>
        <div className={styles.heroGrid}>
          <div>
            <p className={styles.eyebrow}>Community ratings · Stuart69Davis</p>
            <h1 className={styles.title}>The Daily Stu</h1>
            {settings.heroTitle && settings.heroTitle.trim().toLowerCase() !== "the daily stu" ? (
              <p className={styles.heroHeadline}>{settings.heroTitle}</p>
            ) : null}
            <p className={styles.intro}>
              The community rates the takes, theories, and timeline turbulence of <strong>@Stuart69Davis</strong>.
            </p>
            <div className={styles.heroStatus}>
              <a href="https://x.com/Stuart69Davis" target="_blank" rel="noopener noreferrer">Open X profile ↗</a>
              <span>{posts.length} archived posts</span>
            </div>
          </div>
          <section className={styles.overall} aria-label="Overall community rating">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className={styles.eyebrow}>Overall community rating</span>
              <span className="font-mono text-sm text-muted">{overallVoteCount.toLocaleString()} votes</span>
            </div>
            <BangerMeter score={overallRating} voteCount={overallVoteCount} detail={overallVoteCount > 0 ? `${overallVoteCount} vote${overallVoteCount === 1 ? "" : "s"} cast` : undefined} className="mt-4" />
            <p className="mt-3 text-sm leading-6 text-muted">
              {overallVoteCount > 0 ? "Share of archived votes marked Banger." : "The rating will appear when verified posts receive community votes."}
            </p>
          </section>
        </div>
      </header>

      <section className={styles.today} aria-labelledby="daily-stu-today">
        <div className={styles.todayCopy}>
          <p className={styles.eyebrow}>Today&apos;s check · separate vote reward</p>
          <h2 id="daily-stu-today" className={styles.sectionTitle}>{settings.dailyTitle}</h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted">{DAILY_STU_REWARD_SENTENCE}</p>
          {dailyBanger && dailyDisplayPost ? (
            <div className={styles.dailyPost}>
              <TweetIdentity date={formatPostDate(dailyDisplayPost.publishedAt)} />
              <blockquote className="mt-4 text-lg leading-snug text-white sm:text-xl">{dailyDisplayPost.text}</blockquote>
              <BangerMeter score={rating(dailyDisplayPost)} voteCount={totalVotes(dailyDisplayPost)} className="mt-4 max-w-xl" />
            </div>
          ) : (
            <p className={styles.empty}>No verified post is available for today&apos;s check.</p>
          )}
        </div>
        {dailyBanger && dailyDisplayPost ? (
          <div className={styles.dailyAction}>
            <p className={styles.eyebrow}>Your vote</p>
            {dailyVote ? (
              <p className={styles.rewardState}>{dailyPending ? "Saving vote…" : dailyRewardAmount ? `✓ $${dailyRewardAmount} bonus claimed` : "✓ Vote saved"}</p>
            ) : (
              <p className={styles.rewardState}>Vote once a day · ${listedDailyReward} reward</p>
            )}
            <VoteButtons post={dailyDisplayPost} currentVote={dailyDisplayVote} onVote={voteDaily} disabled={dailyPending || Boolean(dailyVote)} />
            {dailyMessage ? <p className="mt-3 text-sm text-muted" role="status" aria-live="polite">{dailyMessage}</p> : null}
            <LocalResetTime endsAt={dailyBanger.endsAt} />
          </div>
        ) : null}
      </section>

      <div className={styles.columns}>
        <section className={styles.feed} aria-labelledby="daily-stu-recent">
          <div className={styles.sectionHeading}>
            <div>
              <p className={styles.eyebrow}>Verified posts</p>
              <h2 id="daily-stu-recent" className={styles.sectionTitle}>{settings.recentTitle}</h2>
            </div>
            <span className="text-xs text-muted">{recentPosts.length} in the last 45 days</span>
          </div>
          {recentPosts.length > 0 ? (
            <div className="mt-4 flex flex-col gap-4">
              {recentPosts.map((post) => (
                <TweetCard key={post.id} post={post} currentVote={displayVotes[post.id]} onVote={(nextVote) => vote(post.id, nextVote)} votePending={isVoteLocked(post.id)} voteMessage={voteMessages[post.id]} featured={post.id === recentPosts[0].id} />
              ))}
            </div>
          ) : (
            <p className={styles.empty}>No verified posts from the last 45 days. The feed stays empty until source posts are available.</p>
          )}
        </section>

        <aside className={styles.sidebar} aria-label="Community archive and rankings">
          <section className={styles.panel} aria-labelledby="daily-stu-podium">
            <p className={styles.eyebrow}>Most highly rated</p>
            <h2 id="daily-stu-podium" className={styles.panelTitle}>{settings.podiumTitle}</h2>
            {rankedPosts.length > 0 ? (
              <ol className={styles.rankList}>
                {rankedPosts.slice(0, 3).map((post, index) => (
                  <li key={post.id} className={styles.rankItem}>
                    <span className={styles.rankNumber}>{index + 1}</span>
                    <div className="min-w-0 flex-1">
                      <TweetIdentity compact date={formatPostDate(post.publishedAt)} />
                      <p className="mt-2 line-clamp-3 text-sm leading-5 text-white">{post.text}</p>
                      <BangerMeter score={rating(post)} voteCount={totalVotes(post)} compact className="mt-2" />
                    </div>
                  </li>
                ))}
              </ol>
            ) : <p className={styles.empty}>No community ratings yet.</p>}
          </section>

          <section className={styles.panel} aria-labelledby="daily-stu-lowest">
            <p className={styles.eyebrow}>Lowest rated</p>
            <h2 id="daily-stu-lowest" className={styles.panelTitle}>{settings.stinkerTitle}</h2>
            {stinkerPosts.length > 0 ? (
              <ol className={styles.rankList}>
                {stinkerPosts.slice(0, 3).map((post, index) => (
                  <li key={post.id} className={styles.rankItem}>
                    <span className={styles.rankNumber}>{index + 1}</span>
                    <div className="min-w-0 flex-1">
                      <TweetIdentity compact date={formatPostDate(post.publishedAt)} />
                      <p className="mt-2 line-clamp-3 text-sm leading-5 text-white">{post.text}</p>
                      <span className="mt-2 inline-block text-xs font-semibold text-[var(--play-danger)]">{stinkerRating(post)}% Stinker</span>
                    </div>
                  </li>
                ))}
              </ol>
            ) : <p className={styles.empty}>No community stinkers yet.</p>}
          </section>

          <section className={styles.panel} aria-labelledby="daily-stu-archive">
            <p className={styles.eyebrow}>From the archive</p>
            <h2 id="daily-stu-archive" className={styles.panelTitle}>{settings.randomTitle}</h2>
            {randomPost ? (
              <div className="mt-4">
                <TweetCard post={randomPost} currentVote={displayVotes[randomPost.id]} onVote={(nextVote) => vote(randomPost.id, nextVote)} votePending={isVoteLocked(randomPost.id)} voteMessage={voteMessages[randomPost.id]} />
              </div>
            ) : <p className={styles.empty}>No verified posts are available in the archive yet.</p>}
            <button type="button" onClick={() => setRandomPostId(pickRandomPost(posts)?.id)} disabled={posts.length === 0} className={styles.archiveButton}>
              {posts.length === 0 ? "Awaiting verified posts" : "Choose another post"}
            </button>
          </section>
        </aside>
      </div>

      <footer className={styles.disclaimer}>FPL does not condone or endorse any posts made by Stu.</footer>
    </main>
  );
}
