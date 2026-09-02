import type { Metadata } from "next";
import { createBettingServiceClient } from "@/lib/betting/service-client";
import { INVITE_DAYS, inviteExpired } from "@/lib/cards/signing";
import InviteSignaturePad from "@/components/cards/InviteSignaturePad";

export const metadata: Metadata = {
  title: "Sign your card — FPL",
};

// The token in the URL is the only credential there is, so the page can
// never be cached or prerendered against a stale invite.
export const dynamic = "force-dynamic";

/**
 * The public end of a one-time signing link. No account, no login: the
 * owner minted a token for one champion, sent it over Discord, and this
 * page greets whoever holds it by the invite's display name and offers
 * the pad. Every real decision (burn the token, write the ink) happens in
 * submitInviteSignatureAction on the service client — this page only
 * decides which of the three states to show: valid, spent, or expired.
 */
export default async function SigningInvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  type InviteRow = { display_name: string; expires_at: string; used_at: string | null };
  let invite: InviteRow | null = null;
  if (/^[0-9a-f]{32}$/.test(token)) {
    const service = createBettingServiceClient();
    const { data } = await service
      .from("signature_invites")
      .select("display_name, expires_at, used_at")
      .eq("token", token)
      .maybeSingle();
    invite = data as InviteRow | null;
  }

  if (!invite) {
    return (
      <main className="flex flex-1 items-center justify-center page-backdrop p-8">
        <section className="card-brand max-w-md p-6 text-center">
          <h1 className="type-display text-2xl text-white">Link not found</h1>
          <p className="mt-2 text-sm text-muted">
            This signing link isn&apos;t valid. Ask whoever sent it for a fresh one.
          </p>
        </section>
      </main>
    );
  }

  if (invite.used_at) {
    return (
      <main className="flex flex-1 items-center justify-center page-backdrop p-8">
        <section className="card-brand max-w-md p-6 text-center">
          <h1 className="type-display text-2xl text-white">Already signed</h1>
          <p className="mt-2 text-sm text-muted">
            This link was already used — a signature is on file. If that was a mistake or a stray mark, ask
            whoever sent the link for a fresh one; signing again just replaces what&apos;s there.
          </p>
        </section>
      </main>
    );
  }

  if (inviteExpired(invite.expires_at)) {
    return (
      <main className="flex flex-1 items-center justify-center page-backdrop p-8">
        <section className="card-brand max-w-md p-6 text-center">
          <h1 className="type-display text-2xl text-white">Link expired</h1>
          <p className="mt-2 text-sm text-muted">
            Signing links last {INVITE_DAYS} days and this one has lapsed. Ask for a fresh one.
          </p>
        </section>
      </main>
    );
  }

  return (
    <main className="flex flex-1 items-center justify-center page-backdrop p-8">
      <section className="card-brand flex w-full max-w-lg flex-col items-center gap-4 p-6 text-center">
        <span className="label-dash">THE FACELESS DROP</span>
        <h1 className="type-display text-3xl text-white">Sign your card, {invite.display_name}</h1>
        <p className="max-w-[46ch] text-sm text-muted">
          Your championship card only ever carries a real autograph. Draw your signature below — finger or
          stylus both work — and a lucky few pulls of your card will come out inked.
        </p>
        <InviteSignaturePad token={token} />
      </section>
    </main>
  );
}
