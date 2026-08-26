import type { Metadata } from "next";
import Link from "next/link";
import CardClaim, { type CardClaimState } from "@/components/cards/CardClaim";
import PlayerCard3D from "@/components/cards/PlayerCard3D";
import TiltHint from "@/components/cards/TiltHint";
import ShareCardActions from "@/components/cards/ShareCardActions";
import SkinPicker from "@/components/cards/SkinPicker";
import { fetchAllCardSeasons, fetchCardBySlug, fetchRatingHistory, type RatingHistoryPoint } from "@/lib/cards/queries";
import { fetchChampionSkinNums } from "@/lib/packs/skins";
import { createServerSupabase } from "@/lib/supabase/server";

/** The card's recorded weekly readings — the season arc. Tier changes get a
 *  highlighted marker. Hidden until two points exist.
 *
 *  The live card is deliberately NOT appended any more. card_rating_history
 *  is written by the weekly drop from the season-cumulative build, while the
 *  card above now rates this week alone; pinning a weekly number onto the end
 *  of a season arc would draw a cliff that nothing actually did. The strip is
 *  the recorded history and only that. */
function SeasonJourney({ history }: { history: RatingHistoryPoint[] }) {
  const points = history.map((point) => ({ overall: point.overall, tier: point.tier }));
  // Collapse consecutive identical readings so quiet weeks don't repeat.
  const arc = points.filter(
    (point, index) => index === 0 || point.overall !== points[index - 1].overall || point.tier !== points[index - 1].tier,
  );
  if (arc.length < 2) return null;
  return (
    <section className="flex flex-col items-center gap-2" aria-label="Season journey">
      <span className="label-dash">Season journey</span>
      <div className="flex flex-wrap items-center justify-center gap-1.5 text-sm">
        {arc.map((point, index) => {
          const tierChanged = index > 0 && point.tier !== arc[index - 1].tier;
          const up = index > 0 && point.overall > arc[index - 1].overall;
          return (
            <span key={index} className="flex items-center gap-1.5">
              {index > 0 && <span aria-hidden className="text-steel">→</span>}
              <span
                className={`rounded-full border px-2 py-0.5 font-mono font-bold ${
                  tierChanged
                    ? up
                      ? "border-mint/60 text-mint"
                      : "border-red-400/60 text-red-400"
                    : "border-line text-white"
                }`}
                title={point.tier}
              >
                {point.overall}
              </span>
              {tierChanged && (
                <span className={`text-[10px] font-bold uppercase tracking-wide ${up ? "text-mint" : "text-red-400"}`}>
                  {point.tier}
                </span>
              )}
            </span>
          );
        })}
      </div>
    </section>
  );
}

// The public face of one player's card — shareable by design: anyone with
// the link sees the live 3D card (no account, no premium), and the OG
// image below makes a pasted link unfurl into the card on Discord. The
// premium gate lives on the /cards hub, not here; this page is the ad.

/** Share URLs span both leagues: try Premier's season first, then the
 *  Academy's, so one /card/[slug] namespace serves every player. */
async function loadCard(slug: string) {
  const supabase = await createServerSupabase();
  for (const { league, season } of await fetchAllCardSeasons(supabase)) {
    const card = await fetchCardBySlug(supabase, season, slug);
    if (card) return { card, league };
  }
  return null;
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const card = (await loadCard(slug))?.card ?? null;
  if (!card) return { title: "Player card — FPL" };
  return {
    title: `${card.name} — ${card.overall} OVR ${card.tier.label} | FPL`,
    description: `${card.archetype} · ${card.role}${card.teamName ? ` · ${card.teamName}` : ""} · ${card.wins}–${card.losses} (${Math.round(card.winratePct)}% WR) · Season ${card.season}`,
    openGraph: { images: [`/card/${slug}/card.png`] },
    twitter: { card: "summary_large_image", images: [`/card/${slug}/card.png`] },
  };
}

/** A query flag is "on" when it reads `1`; repeated params arrive as an
 *  array, so take the first. */
function flag(value: string | string[] | undefined): boolean {
  return (Array.isArray(value) ? value[0] : value) === "1";
}

export default async function CardSharePage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { slug } = await params;
  // Deep links from the /cards hub's "your card" banner: ?customize=1 opens
  // the customizer straight away, ?claim=1 rings the claim row. Both are
  // hints, not permissions — the server still decides what to render at all.
  const query = await searchParams;
  const openCustomizer = flag(query.customize);
  const highlightClaim = flag(query.claim);
  const loaded = await loadCard(slug);
  const card = loaded?.card ?? null;
  const collectionHref = loaded?.league === "academy" ? "/academy/cards" : "/cards";

  // May this viewer restyle the card's art? Admins, a captain whose roster
  // contains the player, or — since 20260826000017 — the player who claimed
  // this card and was approved. can_edit_card_art folds the approved claim in
  // itself, so the customizer below lights up for a claimant with no extra
  // wiring here. Any failure — signed out, migration not applied — just hides
  // the picker.
  let canEditArt = false;
  let history: RatingHistoryPoint[] = [];
  // The claim row and who may rule on it. canModerate is the narrower
  // "admin or captain" half of the predicate above — an approved claimant can
  // edit their card but must not be able to approve the next claim on it.
  let claim: CardClaimState | null = null;
  let canModerate = false;
  let viewerProfileId: string | null = null;
  // The saved autograph, for the signature pad's preview only. It is
  // deliberately NOT part of the live card: ink belongs on pulled copies
  // that rolled signed (src/lib/packs/signatures.ts), never on the card
  // everyone can see here.
  let signature: string | null = null;
  // Riot's skin nums for the signature champion, read once here so the
  // picker can render the real catalog instead of probing numbers blind.
  // Floors at `[0]` on any failure, same as everything else on this page.
  let skinNums: number[] = [0];
  if (card) {
    const supabase = await createServerSupabase();
    const { data } = await supabase
      .rpc("can_edit_card_art", { p_season: card.season, p_summoner: card.name, p_tag: card.tag })
      .then((result) => result, () => ({ data: null }));
    canEditArt = data === true;
    history = await fetchRatingHistory(supabase, card.season, card.slug);
    if (canEditArt) {
      // One narrow read, and only for the editor — a failure (the signature
      // migration not applied yet) just shows an empty pad.
      const { data: prefs } = await supabase
        .from("card_art_prefs")
        .select("signature")
        .eq("season", card.season)
        .eq("summoner_name", card.name)
        .eq("tag", card.tag)
        .maybeSingle()
        .then((result) => result, () => ({ data: null }));
      signature = (prefs as { signature: string | null } | null)?.signature ?? null;
      if (card.signature) skinNums = await fetchChampionSkinNums(card.signature.champion);
    }

    const { data: viewer } = await supabase.auth.getUser().then((result) => result, () => ({ data: { user: null } }));
    viewerProfileId = viewer.user?.id ?? null;

    const { data: moderates } = await supabase
      .rpc("can_moderate_card", { p_season: card.season, p_summoner: card.name, p_tag: card.tag })
      .then((result) => result, () => ({ data: null }));
    canModerate = moderates === true;

    // Failure-tolerant like the signature read above: before the claims
    // migration lands this table doesn't exist, and the row simply reads as
    // "unclaimed".
    const { data: claimRow } = await supabase
      .from("card_claims")
      .select("profile_id, status")
      .eq("season", card.season)
      .eq("summoner_name", card.name)
      .eq("tag", card.tag)
      .maybeSingle()
      .then((result) => result, () => ({ data: null }));
    const row = claimRow as { profile_id: string; status: "pending" | "approved" } | null;
    if (row) {
      // profiles carries a public read policy (profiles_public_read,
      // 20260807000001), so the anon page client can name the claimant.
      const { data: claimant } = await supabase
        .from("profiles")
        .select("display_name")
        .eq("id", row.profile_id)
        .maybeSingle()
        .then((result) => result, () => ({ data: null }));
      claim = {
        profileId: row.profile_id,
        status: row.status,
        displayName: (claimant as { display_name: string | null } | null)?.display_name ?? null,
      };
    }
  }

  if (!card) {
    return (
      <main className="bg-hash flex flex-1 flex-col items-center justify-center gap-4 px-6 py-24 text-center">
        <span className="label-dash">Player cards</span>
        <h1 className="type-display text-3xl">Card not found</h1>
        <p className="max-w-md text-sm text-steel">
          No rated player matches this link for the current season — cards exist once a player has
          ingested games.
        </p>
        <Link href="/" className="btn-pill mt-2">Back to FPL</Link>
      </main>
    );
  }

  return (
    <main className="bg-hash flex flex-1 flex-col items-center gap-6 px-4 py-12 text-white">
      <header className="text-center">
        <span className="label-dash">FPL player card · Season {card.season}</span>
        <h1 className="type-display mt-2 text-4xl">{card.name}</h1>
      </header>
      <PlayerCard3D card={card} reveal bloom gyro />
      <TiltHint />
      <SeasonJourney history={history} />
      <ShareCardActions slug={card.slug} />
      <CardClaim
        season={card.season}
        summonerName={card.name}
        tag={card.tag}
        viewerProfileId={viewerProfileId}
        canModerate={canModerate}
        claim={claim}
        highlight={highlightClaim}
      />
      {canEditArt && card.signature ? (
        <SkinPicker
          season={card.season}
          summonerName={card.name}
          tag={card.tag}
          champion={card.signature.champion}
          currentSkin={card.artSkin}
          skinNums={skinNums}
          currentMotto={card.motto}
          currentSignature={signature}
          initialOpen={openCustomizer}
        />
      ) : null}
      <p className="max-w-md text-center text-xs text-steel">
        Cards rebuild themselves from the season&apos;s stats after every match night.{" "}
        <Link href={collectionHref} className="text-coral underline-offset-4 hover:underline">
          Premium members browse the whole collection →
        </Link>
      </p>
    </main>
  );
}
