export type BangerPost = {
  id: string;
  text: string;
  publishedAt: string;
  bangerVotes: number;
  midVotes: number;
  replies?: number;
  reposts?: number;
  likes?: number;
  url: string;
};

export const BANGER_POSTS: BangerPost[] = [
  { id: "jungle-01", text: "The cleanest read is usually the one nobody else is ready for.", publishedAt: "2026-08-21", bangerVotes: 146, midVotes: 12, replies: 18, reposts: 42, likes: 311, url: "https://x.com/Stuart69Davis" },
  { id: "jungle-02", text: "If the plan needs three paragraphs of context, it was never the plan.", publishedAt: "2026-08-17", bangerVotes: 128, midVotes: 19, replies: 14, reposts: 31, likes: 274, url: "https://x.com/Stuart69Davis" },
  { id: "jungle-03", text: "A banana in the hand is worth two tabs open about bananas.", publishedAt: "2026-08-11", bangerVotes: 119, midVotes: 23, replies: 29, reposts: 27, likes: 248, url: "https://x.com/Stuart69Davis" },
  { id: "jungle-04", text: "Good teams communicate. Great teams communicate before the problem becomes content.", publishedAt: "2026-08-05", bangerVotes: 96, midVotes: 28, replies: 10, reposts: 19, likes: 201, url: "https://x.com/Stuart69Davis" },
  { id: "jungle-05", text: "The meta is just a group project with better graphics.", publishedAt: "2026-07-30", bangerVotes: 91, midVotes: 31, replies: 21, reposts: 16, likes: 189, url: "https://x.com/Stuart69Davis" },
  { id: "jungle-06", text: "Sometimes the boldest play is letting the other person overthink first.", publishedAt: "2026-07-24", bangerVotes: 75, midVotes: 22, replies: 8, reposts: 14, likes: 154, url: "https://x.com/Stuart69Davis" },
  { id: "jungle-07", text: "Archive pull: confidence is a resource. Spend it where the numbers cannot.", publishedAt: "2026-05-18", bangerVotes: 83, midVotes: 11, replies: 9, reposts: 22, likes: 163, url: "https://x.com/Stuart69Davis" },
  { id: "jungle-08", text: "Archive pull: the best take in the room is the one that survives the walk home.", publishedAt: "2025-12-03", bangerVotes: 67, midVotes: 9, replies: 7, reposts: 18, likes: 140, url: "https://x.com/Stuart69Davis" },
  { id: "jungle-09", text: "Archive pull: never confuse volume with momentum.", publishedAt: "2025-06-12", bangerVotes: 54, midVotes: 7, replies: 5, reposts: 12, likes: 101, url: "https://x.com/Stuart69Davis" },
  { id: "jungle-10", text: "Archive pull: the banana is round, but the point is sharp.", publishedAt: "2025-01-23", bangerVotes: 41, midVotes: 6, replies: 4, reposts: 9, likes: 88, url: "https://x.com/Stuart69Davis" },
];

export function rating(post: BangerPost) {
  const total = post.bangerVotes + post.midVotes;
  return total === 0 ? 0 : Math.round((post.bangerVotes / total) * 100);
}

export function getRecentPosts(posts: BangerPost[], now = new Date()) {
  const cutoff = new Date(now);
  cutoff.setUTCDate(cutoff.getUTCDate() - 45);
  return posts
    .filter((post) => new Date(`${post.publishedAt}T23:59:59Z`) >= cutoff)
    .sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
}

export function getTopPosts(posts: BangerPost[]) {
  return [...posts].sort((a, b) => rating(b) - rating(a) || b.bangerVotes - a.bangerVotes).slice(0, 3);
}

export function pickRandomPost(posts: BangerPost[], random = Math.random) {
  return posts[Math.min(posts.length - 1, Math.floor(random() * posts.length))];
}
