export type BangerPost = {
  id: string;
  text: string;
  publishedAt: string;
  bangerVotes: number;
  midVotes: number;
  stinkerVotes: number;
  replies?: number;
  reposts?: number;
  likes?: number;
  url: string;
};

// Posts are intentionally empty until they are verified from the real X
// account. Do not populate this with illustrative copy or seeded votes.
export const BANGER_POSTS: BangerPost[] = [];

export function formatPostDate(date: string) {
  const parsedDate = /^\d{4}-\d{2}-\d{2}$/.test(date) ? new Date(`${date}T12:00:00Z`) : new Date(date);
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(parsedDate);
}

export function rating(post: BangerPost) {
  const total = post.bangerVotes + post.midVotes + post.stinkerVotes;
  return total === 0 ? 0 : Math.round((post.bangerVotes / total) * 100);
}

export function stinkerRating(post: BangerPost) {
  const total = post.bangerVotes + post.midVotes + post.stinkerVotes;
  return total === 0 ? 0 : Math.round((post.stinkerVotes / total) * 100);
}

export function getRecentPosts(posts: BangerPost[], now = new Date()) {
  const cutoff = new Date(now);
  cutoff.setUTCDate(cutoff.getUTCDate() - 45);
  return posts
    .filter((post) => {
      const publishedAt = /^\d{4}-\d{2}-\d{2}$/.test(post.publishedAt)
        ? `${post.publishedAt}T23:59:59Z`
        : post.publishedAt;
      return new Date(publishedAt) >= cutoff;
    })
    .sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
}

export function getTopPosts(posts: BangerPost[]) {
  return [...posts]
    .filter((post) => post.bangerVotes + post.midVotes + post.stinkerVotes > 0)
    .sort((a, b) => rating(b) - rating(a) || b.bangerVotes - a.bangerVotes)
    .slice(0, 3);
}

export function getStinkerPosts(posts: BangerPost[]) {
  return [...posts]
    .filter((post) => post.bangerVotes + post.midVotes + post.stinkerVotes > 0)
    .sort((a, b) => stinkerRating(b) - stinkerRating(a) || b.stinkerVotes - a.stinkerVotes)
    .slice(0, 3);
}

export function pickRandomPost(posts: BangerPost[], random = Math.random): BangerPost | undefined {
  if (posts.length === 0) return undefined;
  return posts[Math.min(posts.length - 1, Math.floor(random() * posts.length))];
}
