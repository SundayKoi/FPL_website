import { describe, expect, it } from "vitest";
import { BANGER_POSTS, getRecentPosts, getTopPosts, pickRandomPost, type BangerPost } from "./feed";

const posts: BangerPost[] = [
  { id: "old", text: "Old wisdom", publishedAt: "2025-01-01", bangerVotes: 20, midVotes: 10, url: "https://x.com" },
  { id: "one", text: "One", publishedAt: "2026-08-20", bangerVotes: 80, midVotes: 20, url: "https://x.com" },
  { id: "two", text: "Two", publishedAt: "2026-08-19", bangerVotes: 70, midVotes: 10, url: "https://x.com" },
  { id: "three", text: "Three", publishedAt: "2026-08-18", bangerVotes: 60, midVotes: 10, url: "https://x.com" },
  { id: "four", text: "Four", publishedAt: "2026-08-17", bangerVotes: 50, midVotes: 10, url: "https://x.com" },
];

describe("banger feed rules", () => {
  it("does not ship unverified tweets or seeded banger data", () => {
    expect(BANGER_POSTS).toEqual([]);
  });

  it("keeps only posts published in the last 45 days", () => {
    expect(getRecentPosts(posts, new Date("2026-08-23T12:00:00Z")).map((post) => post.id)).toEqual([
      "one",
      "two",
      "three",
      "four",
    ]);
  });

  it("returns the three highest-rated posts by banger share", () => {
    expect(getTopPosts(posts).map((post) => post.id)).toEqual(["two", "three", "four"]);
  });

  it("can pick any post from the all-time archive", () => {
    expect(pickRandomPost(posts, () => 0)!.id).toBe("old");
    expect(pickRandomPost(posts, () => 0.99)!.id).toBe("four");
  });

  it("returns no random post when the verified archive is empty", () => {
    expect(pickRandomPost([])).toBeUndefined();
  });
});
