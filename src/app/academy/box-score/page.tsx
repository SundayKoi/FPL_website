import type { Metadata } from "next";
import { redirect } from "next/navigation";

export const metadata: Metadata = {
  title: "Box scores — FPL Academy",
};

/** Compatibility route for links saved before the game was renamed. */
export default function LegacyAcademyBoxScorePage() {
  redirect("/academy/guess-the-card");
}
