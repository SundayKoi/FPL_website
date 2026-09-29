import { describe, expect, it } from "vitest";
import { getBangerClassification, getRecentPosts, getStinkerPosts, getTopPosts, pickRandomPost, type BangerPost } from "./feed";

const posts: BangerPost[] = [
  { id: "old", text: "Old", publishedAt: "2025-01-01", bangerVotes: 20, midVotes: 10, stinkerVotes: 0, url: "https://x.com" },
  { id: "one", text: "One", publishedAt: "2026-08-20", bangerVotes: 80, midVotes: 20, stinkerVotes: 0, url: "https://x.com" },
  { id: "two", text: "Two", publishedAt: "2026-08-19", bangerVotes: 70, midVotes: 10, stinkerVotes: 20, url: "https://x.com" },
  { id: "three", text: "Three", publishedAt: "2026-08-18", bangerVotes: 60, midVotes: 10, stinkerVotes: 30, url: "https://x.com" },
  { id: "four", text: "Four", publishedAt: "2026-08-17", bangerVotes: 50, midVotes: 10, stinkerVotes: 40, url: "https://x.com" },
];

describe("banger feed rules", () => {
  it.each([
    [0, "stinker", "Stinker"],
    [39, "stinker", "Stinker"],
    [40, "mid", "Mid"],
    [69, "mid", "Mid"],
    [70, "banger", "Banger"],
    [100, "banger", "Banger"],
  ] as const)("classifies %d%% as %s", (score, key, label) => {
    expect(getBangerClassification(score)).toEqual({ key, label });
  });

  it("keeps only posts inside the recent window and orders newest first", () => {
    expect(getRecentPosts(posts, new Date("2026-08-23T12:00:00Z")).map((post) => post.id)).toEqual([
      "one",
      "two",
      "three",
      "four",
    ]);
  });

  it("parses imported timestamps with times when applying the recent window", () => {
    const importedPost = { ...posts[1], publishedAt: "2026-08-20T12:34:56.000Z" };

    expect(getRecentPosts([importedPost], new Date("2026-08-23T12:00:00Z")).map((post) => post.id)).toEqual(["one"]);
  });

  it("ranks the top posts by banger share and excludes zero-vote posts", () => {
    const midOnly = { ...posts[0], id: "mid-only", bangerVotes: 0, midVotes: 10, stinkerVotes: 0 };

    expect(getTopPosts([...posts, midOnly]).map((post) => post.id)).toEqual(["one", "two", "old"]);
  });

  it("ranks stinker posts separately by their share", () => {
    expect(getStinkerPosts(posts).map((post) => post.id)).toEqual(["four", "three", "two"]);
  });

  it("selects an archive post without indexing past the end and handles an empty archive", () => {
    expect(pickRandomPost(posts, () => 0)?.id).toBe("old");
    expect(pickRandomPost(posts, () => 1)?.id).toBe("four");
    expect(pickRandomPost([])).toBeUndefined();
  });
});
