import type { Metadata } from "next";
import CardsPageHeader from "@/components/cards/CardsPageHeader";
import ShowdownBoard from "@/components/showdown/ShowdownBoard";
import ShowdownLobby from "@/components/showdown/ShowdownLobby";
import ShowdownRules from "@/components/showdown/ShowdownRules";
import { loadLobby, loadWeekBoard } from "@/lib/showdown/server";

export const metadata: Metadata = {
  title: "Showdown — FPL",
  description: "Hold'em with the cards you collect, for betting dollars. No card is ever on the line.",
};

/** Showdown's front door: the tables dealing now, a form to open one, and
 *  the rulebook underneath. Anyone can look; sitting needs a signed-in
 *  member with dollars and either ten cards or a house stack. */
export default async function ShowdownPage() {
  const [lobby, week] = await Promise.all([loadLobby(), loadWeekBoard()]);
  return (
    <main className="bg-hash mx-auto flex w-full max-w-[1160px] flex-1 flex-col gap-8 px-4 py-10 text-white sm:px-6">
      <CardsPageHeader eyebrow="Play · Premier" title="Showdown">
        Hold&apos;em with the cards you collect. The board comes from this week&apos;s edition, your hole cards
        come from your own shelf, and the stakes are betting dollars. No card is ever on the line.
      </CardsPageHeader>
      {lobby.season ? (
        <ShowdownLobby tables={lobby.tables} seatedAt={lobby.seatedAt} signedIn={lobby.signedIn} />
      ) : (
        <p className="text-sm text-steel">No card season is running.</p>
      )}
      {week ? <ShowdownBoard week={week.week} board={week.board} /> : null}
      <ShowdownRules />
    </main>
  );
}
