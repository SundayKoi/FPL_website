import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { forksFor } from "@/lib/expeditions/routes";
import RouteMap from "./RouteMap";

describe("RouteMap on the server", () => {
  it("titles each checkpoint in the server HTML, so hydration matches", () => {
    // React 19 renders a <title> with more than one child empty on the
    // server; the browser then rendered the name, and the whole board
    // failed to hydrate on any page with a squad in the field.
    const road = { runId: 301, rules: 5, forks: 2 };
    const html = renderToString(
      <RouteMap tier="raid" road={road} progress={null} forks={[{ status: "pending", pushed: false }, { status: "pending", pushed: false }]} />,
    );
    const place = forksFor("raid", road)[0].title;
    expect(html).toContain(`<title>${place} — pending</title>`);
    expect(html).not.toContain("<title></title>");
  });
});
