import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import AutographMark from "./AutographMark";

const INK = "data:image/png;base64,ink";

describe("AutographMark", () => {
  it("renders a meaningful alt and preserves the supplied source", () => {
    render(
      <AutographMark
        src={INK}
        alt="Alice's autograph"
        placement="large"
        testId="autograph-stage"
        imageTestId="autograph-image"
      />,
    );

    expect(screen.getByTestId("autograph-stage")).toBeTruthy();
    expect(screen.getByAltText("Alice's autograph").getAttribute("src")).toBe(INK);
  });

  it("marks a decorative panel autograph as hidden from assistive technology", () => {
    render(<AutographMark src={INK} alt="" placement="team" imageTestId="team-ink" />);

    expect(screen.getByTestId("team-ink").getAttribute("alt")).toBe("");
    expect(screen.getByTestId("team-ink").getAttribute("aria-hidden")).toBe("true");
  });

  it("renders nothing when no autograph source exists", () => {
    const { container } = render(<AutographMark src={null} alt="Missing autograph" placement="standard" testId="empty-stage" />);

    expect(container.firstChild).toBeNull();
    expect(screen.queryByTestId("empty-stage")).toBeNull();
  });
});
