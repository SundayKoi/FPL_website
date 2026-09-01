// The placeholder both PNG routes serve when there is nothing to picture.
//
// A missing card returns an IMAGE, not a 404. These urls are consumed by
// link unfurlers and by <img> tags in Discord embeds, and a 404 there is a
// broken-image icon in the middle of a message — worse than a plain panel
// that says what happened. The panel is deliberately the card ground's own
// colour so it reads as "this card, empty" rather than as a site error.

import type { ReactElement } from "react";
import { GROUND } from "./treatment";

export function missingCardImage(message: string): ReactElement {
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: GROUND,
        color: "#8fa3b8",
        fontSize: 40,
      }}
    >
      {message}
    </div>
  );
}
