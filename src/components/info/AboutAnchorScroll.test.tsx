import { cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import AboutAnchorScroll from "./AboutAnchorScroll";

const scrollIntoView = vi.fn();

beforeEach(() => {
  window.history.replaceState(null, "", "/info#section-one");
  Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
    configurable: true,
    value: scrollIntoView,
  });
  scrollIntoView.mockClear();
});

afterEach(() => {
  cleanup();
  window.history.replaceState(null, "", "/info");
});

describe("AboutAnchorScroll", () => {
  it("scrolls to a fragment already rendered in the page", async () => {
    render(
      <>
        <h2 id="section-one">Section one</h2>
        <AboutAnchorScroll />
      </>,
    );

    await waitFor(() => expect(scrollIntoView).toHaveBeenCalledWith({ block: "start" }));
  });

  it("waits for streamed content when the fragment target is not rendered yet", async () => {
    window.history.replaceState(null, "", "/info#section-one");
    render(<AboutAnchorScroll />);

    const target = document.createElement("h2");
    target.id = "section-one";
    document.body.append(target);

    await waitFor(() => expect(scrollIntoView).toHaveBeenCalledWith({ block: "start" }));
    target.remove();
  });
});
