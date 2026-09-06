import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import AnnounceGauntletButton from "@/components/admin/AnnounceGauntletButton";
import AnnounceRaritiesButton from "@/components/admin/AnnounceRaritiesButton";
import { fetchStaffTier } from "@/lib/auth/staffTier";
import { rarityAnnouncement } from "@/lib/cards/rarityAnnouncement";
import { gauntletOverhaulAnnouncement } from "@/lib/gauntlet/announcement";
import { createServerSupabase } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Announcements — Admin — FPL" };

/**
 * Every prepared announcement in one place, with the exact text each
 * button will post, so staff read it before they send it. Each post is
 * a pure function of the config that enforces what it describes.
 */
export default async function AdminAnnouncePage() {
  const supabase = await createServerSupabase();
  const { isAdmin, isOwner } = await fetchStaffTier(supabase);
  if (!isAdmin && !isOwner) redirect("/admin");
  const site = process.env.SITE_URL ?? process.env.NEXT_PUBLIC_SITE_URL ?? "https://fpl.gg";
  const posts = [
    {
      key: "rarities",
      embed: rarityAnnouncement(site),
      blurb: "The three new finishes — Shiny, StatTrak and Secret — with their real odds, and where every rarity is explained.",
      button: <AnnounceRaritiesButton />,
      page: { href: "/cards/rarities", label: "the rarities page" },
    },
    {
      key: "gauntlet",
      embed: gauntletOverhaulAnnouncement(site),
      blurb: "The overhaul — the purse, ascension, contracts and openers, the new relics, drafted mode — with a link to the rulebook.",
      button: <AnnounceGauntletButton />,
      page: { href: "/cards/gauntlet", label: "the Gauntlet page" },
    },
  ];

  return (
    <main className="bg-hash mx-auto flex w-full max-w-[1100px] flex-1 flex-col gap-8 px-4 py-10 text-white sm:px-6">
      <header className="flex flex-col gap-2">
        <Link href="/admin" className="text-xs font-bold uppercase tracking-wide text-muted hover:text-white">
          ← Admin
        </Link>
        <span className="label-dash">Staff</span>
        <h1 className="type-display text-4xl sm:text-5xl">Announcements</h1>
        <p className="max-w-2xl text-sm text-steel">
          Each card below is a post the site has ready for the cards channel. Read it, then tap twice to send. Once is
          plenty for each.
        </p>
      </header>

      {posts.map((post) => (
        <section key={post.key} aria-label={post.embed.title} className="card-brand flex flex-col gap-3 p-5">
          <h2 className="type-display text-2xl">{post.embed.title}</h2>
          <p className="text-sm text-muted">
            {post.blurb} Links to{" "}
            <Link href={post.page.href} className="text-gold underline-offset-4 hover:underline">
              {post.page.label}
            </Link>
            .
          </p>
          <pre className="max-w-full overflow-x-auto whitespace-pre-wrap rounded-lg border border-border-subtle bg-canvas/60 p-4 text-xs leading-relaxed text-steel">
            {post.embed.description}
          </pre>
          {post.button}
        </section>
      ))}
    </main>
  );
}
