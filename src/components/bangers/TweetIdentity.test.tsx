import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import TweetIdentity, { STUART_PROFILE_IMAGE_URL } from "./TweetIdentity";

afterEach(cleanup);

describe("TweetIdentity", () => {
  it("renders Stuart's X profile image beside the author identity", () => {
    render(<TweetIdentity date="Aug 22" />);

    const avatar = screen.getByRole("img", { name: "Stuart69Davis profile picture" });
    expect(avatar.getAttribute("src")).toBe(STUART_PROFILE_IMAGE_URL);
    expect(screen.getByText(/@Stuart69Davis/)).toBeTruthy();
    expect(screen.getByText(/Aug 22/)).toBeTruthy();
  });
});
