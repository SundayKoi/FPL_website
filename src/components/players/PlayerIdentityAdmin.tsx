"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  assignPlayerIdentity,
  replacePlayerIdentity,
  revokePlayerIdentity,
} from "@/lib/players/identityActions";
import type { LeagueKey } from "@/lib/players/identity";

export type VerifiedProfileOption = {
  id: string;
  displayName: string;
  discordId: string | null;
};

export type PlayerIdentityLink = {
  id: string;
  profileId: string;
  status: "pending" | "approved";
} | null;

export type PlayerIdentityLinkRow = NonNullable<PlayerIdentityLink> & {
  playerPoolId: string;
};

type Props = {
  playerPoolId: string;
  league: LeagueKey;
  season: string;
  currentLink: PlayerIdentityLink;
  profiles: VerifiedProfileOption[];
};

export default function PlayerIdentityAdmin({
  playerPoolId,
  league,
  season,
  currentLink,
  profiles,
}: Props) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [selectedProfileId, setSelectedProfileId] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const profilesById = useMemo(
    () => new Map(profiles.map((profile) => [profile.id, profile])),
    [profiles],
  );
  const currentProfile = currentLink ? profilesById.get(currentLink.profileId) : undefined;
  const currentDisplayName = currentProfile?.displayName ?? "Verified profile";
  const normalizedSearch = search.trim().toLowerCase();
  const filteredProfiles = profiles.filter((profile) =>
    !normalizedSearch
      || profile.displayName.toLowerCase().includes(normalizedSearch)
      || profile.discordId?.toLowerCase().includes(normalizedSearch),
  );
  const status = !currentLink
    ? "Unlinked"
    : currentLink.status === "pending"
      ? `Pending — ${currentDisplayName}`
      : `Linked — ${currentDisplayName}`;

  const assignSelectedProfile = async () => {
    if (!selectedProfileId || selectedProfileId === currentLink?.profileId) return;
    const selectedProfile = profilesById.get(selectedProfileId);
    if (!selectedProfile) return;

    if (
      currentLink
      && !window.confirm(`Replace ${currentDisplayName} with ${selectedProfile.displayName}?`)
    ) {
      return;
    }

    setSaving(true);
    setError(null);
    const result = currentLink
      ? await replacePlayerIdentity({
          linkId: currentLink.id,
          profileId: selectedProfileId,
        })
      : await assignPlayerIdentity({
          playerPoolId,
          profileId: selectedProfileId,
          league,
          season,
        });
    setSaving(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setSelectedProfileId("");
    router.refresh();
  };

  const revokeCurrentLink = async () => {
    if (
      !currentLink
      || !window.confirm(`Revoke the link to ${currentDisplayName}?`)
    ) {
      return;
    }

    setSaving(true);
    setError(null);
    const result = await revokePlayerIdentity(currentLink.id);
    setSaving(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    router.refresh();
  };

  return (
    <section aria-label="Player identity administration" className="mt-3 rounded border border-border/70 bg-surface/40 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted">{status}</p>
        {currentLink ? (
          <button
            type="button"
            onClick={() => void revokeCurrentLink()}
            disabled={saving}
            className="text-xs text-red-400 underline disabled:opacity-50"
          >
            Revoke link
          </button>
        ) : null}
      </div>
      {error ? <p className="mt-2 text-xs text-red-400">{error}</p> : null}
      <div className="mt-3 grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)_auto]">
        <input
          aria-label="Search verified profiles"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search name or Discord ID"
          className="rounded border border-border bg-canvas px-3 py-2 text-xs text-white"
        />
        <select
          aria-label="Verified Discord profile"
          value={selectedProfileId}
          onChange={(event) => setSelectedProfileId(event.target.value)}
          className="rounded border border-border bg-canvas px-3 py-2 text-xs text-white"
        >
          <option value="">Select a verified profile</option>
          {filteredProfiles.map((profile) => (
            <option key={profile.id} value={profile.id}>
              {profile.displayName}{profile.discordId ? ` — ${profile.discordId}` : ""}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={() => void assignSelectedProfile()}
          disabled={saving || !selectedProfileId || selectedProfileId === currentLink?.profileId}
          className="rounded border border-primary px-3 py-2 text-xs font-semibold text-primary disabled:opacity-50"
        >
          {currentLink ? "Replace profile" : "Link profile"}
        </button>
      </div>
    </section>
  );
}
