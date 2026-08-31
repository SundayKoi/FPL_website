import { redirect } from "next/navigation";

/** Compatibility route for links saved before the game was renamed. */
export default function LegacyAcademyBoxScorePage() {
  redirect("/academy/guess-the-card");
}
