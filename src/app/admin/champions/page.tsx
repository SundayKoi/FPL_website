import { existsSync } from "node:fs";
import { join } from "node:path";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase/server";
import { createBettingServiceClient } from "@/lib/betting/service-client";
import { fetchStaffTier } from "@/lib/auth/staffTier";
import { CHAMPIONS_SEASON, CHAMPIONS_SET, CHAMPIONS_TEAM, championToCard } from "@/lib/cards/champions";
import { inviteExpired } from "@/lib/cards/signing";
import ChampionsCard from "@/components/cards/ChampionsCard";
import PlayerCard3D from "@/components/cards/PlayerCard3D";
import ChampionsSigningDesk, { type SigningDeskRow } from "@/components/admin/ChampionsSigningDesk";

export const metadata: Metadata = {
  title: "The Faceless Drop — FPL Admin",
};

/**
 * PREVIEW ONLY. Owner-gated look at the Dealer's Hand with real splash
 * art, foil layers, and ink — nothing here mints, and no pack sells these
 * yet. The drop mechanics ship separately once the look is signed off.
 */
export default async function ChampionsPreviewPage() {
  const supabase = await createServerSupabase();
  const { isOwner } = await fetchStaffTier(supabase);
  if (!isOwner) redirect("/admin");

  // The Faceless mark. First choice is the asset committed into the site
  // itself (the import-faceless-logo workflow puts it there) — a relic
  // shouldn't depend on a team row or a storage URL staying alive. The
  // draft-side teams table is the fallback; a miss on both just leaves
  // the spade pip in the center, never a hole.
  let logo: string | null = existsSync(join(process.cwd(), "public", "faceless-logo.png"))
    ? "/faceless-logo.png"
    : null;
  if (!logo) {
    const { data: teamRows } = await supabase
      .from("teams")
      .select("name, image_url")
      .ilike("name", "%faceless%");
    logo =
      ((teamRows as { name: string; image_url: string | null }[]) ?? []).find((row) => row.image_url)?.image_url ??
      null;
  }

  // Season here only labels the future copies' shelf; preview renders the
  // same either way.
  const cards = CHAMPIONS_SET.map((def) => ({ ...championToCard(def, "S5"), teamImageUrl: logo }));
  const queen = cards.find((card) => card.champWin?.rank === "Q") ?? cards[0];

  // The signing desk's ledger: whose real ink is already on file (any
  // season — same cross-season lookup the mint uses), and which live
  // links are already out. Both on the service client: card_art_prefs
  // rows for non-members aren't visible any other way, and
  // signature_invites has no PostgREST surface at all. Errors collapse to
  // empty — the desk still renders before the invites migration lands.
  const service = createBettingServiceClient();
  const { data: inkData } = await service
    .from("card_art_prefs")
    .select("summoner_name, tag, season, signature")
    .in("summoner_name", CHAMPIONS_SET.map((def) => def.riot.summoner))
    .not("signature", "is", null)
    .order("season", { ascending: false });
  // Newest season's ink per account — the same row the pack mint would
  // print, carried whole so the desk can SHOW the owner what got captured
  // (a stray-dot save looks like ink in a boolean and like a dot here).
  const inkByAccount = new Map<string, string>();
  for (const row of (inkData as { summoner_name: string; tag: string; signature: string }[]) ?? []) {
    const key = `${row.summoner_name}#${row.tag}`.toLowerCase();
    if (!inkByAccount.has(key)) inkByAccount.set(key, row.signature);
  }
  const { data: inviteData } = await service
    .from("signature_invites")
    .select("token, summoner_name, tag, expires_at, used_at")
    .is("used_at", null)
    .order("created_at", { ascending: false });
  const liveInvites = ((inviteData as { token: string; summoner_name: string; tag: string; expires_at: string }[]) ?? []).filter(
    (row) => !inviteExpired(row.expires_at),
  );
  const deskRows: SigningDeskRow[] = CHAMPIONS_SET.map((def) => {
    const invite = liveInvites.find((row) => row.summoner_name === def.riot.summoner && row.tag === def.riot.tag);
    return {
      rank: def.rank,
      name: def.name,
      summoner: def.riot.summoner,
      tag: def.riot.tag,
      ink: inkByAccount.get(`${def.riot.summoner}#${def.riot.tag}`.toLowerCase()) ?? null,
      invite: invite ? { token: invite.token, expiresAt: invite.expires_at } : null,
    };
  });

  return (
    <main className="bg-hash mx-auto flex w-full max-w-[1400px] flex-1 flex-col gap-10 px-6 py-16">
      <header>
        <span className="label-dash">OWNERS ONLY · PREVIEW — NOT PULLABLE</span>
        <h1 className="type-display mt-3 text-4xl sm:text-5xl">The Faceless Drop</h1>
        <p className="mt-2 max-w-[62ch] text-sm text-muted">
          {CHAMPIONS_TEAM} — {CHAMPIONS_SEASON} champions, printed as the Dealer&apos;s Hand. Real splash art, the
          production foil layers, and the ink placement. Nothing mints from this page; the pack drop ships after
          sign-off.
        </p>
      </header>

      <section aria-label="The Hand" className="flex flex-wrap justify-center gap-6 sm:justify-start">
        {cards.map((card) => (
          <PlayerCard3D key={card.slug} card={card} />
        ))}
      </section>

      <section aria-label="Luck rolls" className="flex flex-col gap-4">
        <h2 className="type-display text-2xl">Foiled &amp; signed</h2>
        <p className="max-w-[62ch] text-sm text-muted">
          The Q♠ through every parallel, plus the autograph. Ink is REAL only: the mint rolls signatures solely
          for champions whose drawn ink is on file (the script shown here is the preview stand-in). Champions who
          can&apos;t currently sign simply never come signed — until they do.
        </p>
        <div className="flex flex-wrap gap-6">
          {(["prisma", "aurora", "refractor", "ice"] as const).map((type) => (
            <figure key={type} className="flex w-60 flex-col items-center gap-2">
              <ChampionsCard card={queen} foil foilType={type} />
              <figcaption className="text-xs uppercase tracking-[0.16em] text-muted">{type}</figcaption>
            </figure>
          ))}
          <figure className="flex w-60 flex-col items-center gap-2">
            {/* Signed always prints foil (base Prisma when the parallel
                didn't roll on its own) — same rule as player cards. */}
            <ChampionsCard card={queen} foil foilType="prisma" signed />
            <figcaption className="text-xs uppercase tracking-[0.16em] text-muted">autographed · always foil</figcaption>
          </figure>
        </div>
      </section>

      <section aria-label="Signing links" className="flex flex-col gap-4">
        <h2 className="type-display text-2xl">Signing links</h2>
        <p className="max-w-[62ch] text-sm text-muted">
          For champions who aren&apos;t site members: mint a one-time link, DM it, and they draw their signature
          on their phone — no account needed. The ink lands under their {CHAMPIONS_SEASON} riot account, and
          from then on their card can roll autographed.
        </p>
        <ChampionsSigningDesk rows={deskRows} season={CHAMPIONS_SEASON} />
      </section>
    </main>
  );
}
