import { redirect } from "next/navigation";

/** Compatibility route for links saved before the game was renamed. */
export default function LegacyBoxScorePage() {
  redirect("/guess-the-card");
}
