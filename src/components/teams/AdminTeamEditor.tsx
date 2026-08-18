"use client";

import { useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { Profile, Team } from "@/lib/draft/types";
import { isHexBannerColor, normalizeBannerColor } from "@/lib/teams/bannerColor";

const ALLOWED_IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"];
const MAX_IMAGE_SIZE = 2 * 1024 * 1024;

type FormStatus =
  | { kind: "idle" }
  | { kind: "saving" }
  | { kind: "success"; message: string }
  | { kind: "error"; message: string };

type TeamFormState = {
  name: string;
  abbreviation: string;
  division: "" | "Lunari" | "Solari";
  bannerColor: string;
  captainProfileId: string;
  currentImageUrl: string | null;
  selectedFile: File | null;
  status: FormStatus;
};

type AdminTeamEditorProps = {
  draftId: string;
  teams: Team[];
  profiles: Profile[];
  children: ReactNode;
};

function formStateFor(teams: Team[]): Record<string, TeamFormState> {
  return Object.fromEntries(
    teams.map((team) => [
      team.id,
      {
        name: team.name,
        abbreviation: team.abbreviation.toUpperCase(),
        division: team.division ?? "",
        bannerColor: normalizeBannerColor(team.banner_color),
        captainProfileId: team.captain_profile_id ?? "",
        currentImageUrl: team.image_url,
        selectedFile: null,
        status: { kind: "idle" },
      },
    ])
  );
}

function messageFor(error: unknown) {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return (error as { message?: string } | null)?.message ?? "The team could not be saved.";
}

function versionedObjectPath(draftId: string, teamId: string) {
  return `${draftId}/${teamId}/${crypto.randomUUID()}`;
}

function managedObjectPath(imageUrl: string | null, draftId: string, teamId: string) {
  if (!imageUrl) return null;

  try {
    const url = new URL(imageUrl);
    const publicPath = "/storage/v1/object/public/team-images/";
    const publicPathIndex = url.pathname.indexOf(publicPath);
    if (publicPathIndex === -1) return null;

    const objectPath = decodeURIComponent(url.pathname.slice(publicPathIndex + publicPath.length));
    const teamPrefix = `${draftId}/${teamId}`;
    return objectPath === teamPrefix || objectPath.startsWith(`${teamPrefix}/`) ? objectPath : null;
  } catch {
    return null;
  }
}

function DraftTeamEditor({
  draftId,
  teams,
  profiles,
  children,
}: AdminTeamEditorProps) {
  const supabase = createClient();
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [forms, setForms] = useState(() => formStateFor(teams));

  const setForm = (teamId: string, patch: Partial<TeamFormState>) => {
    setForms((current) => ({
      ...current,
      [teamId]: { ...current[teamId], ...patch },
    }));
  };

  const isSavingAll = Object.values(forms).some((form) => form.status.kind === "saving");

  const saveTeam = async (team: Team) => {
    const form = forms[team.id];
    if (!form || form.status.kind === "saving") return;

    const name = form.name.trim();
    const abbreviation = form.abbreviation.trim().toUpperCase();
    const bannerColor = form.bannerColor.trim().toLowerCase();
    if (!name || !/^[A-Z0-9]{1,5}$/.test(abbreviation) || !isHexBannerColor(bannerColor)) {
      setForm(team.id, {
        abbreviation,
        bannerColor,
        status: {
          kind: "error",
          message: "Enter a team name, an abbreviation of 1–5 characters, a hex banner color, and an allowed image file.",
        },
      });
      return;
    }
    if (
      form.selectedFile &&
      (!ALLOWED_IMAGE_TYPES.includes(form.selectedFile.type) || form.selectedFile.size > MAX_IMAGE_SIZE)
    ) {
      setForm(team.id, {
        status: {
          kind: "error",
          message: "Images must be PNG, JPEG, WebP, or GIF files up to 2 MiB.",
        },
      });
      return;
    }

    const previousObjectPath = managedObjectPath(form.currentImageUrl, draftId, team.id);
    let imageUrl = form.currentImageUrl;
    let uploadedObjectPath: string | null = null;
    setForm(team.id, { abbreviation, bannerColor, status: { kind: "saving" } });

    try {
      if (form.selectedFile) {
        uploadedObjectPath = versionedObjectPath(draftId, team.id);
        const { error: uploadError } = await supabase.storage.from("team-images").upload(
          uploadedObjectPath,
          form.selectedFile,
          { upsert: false, contentType: form.selectedFile.type }
        );
        if (uploadError) throw uploadError;

        const { data } = supabase.storage.from("team-images").getPublicUrl(uploadedObjectPath);
        imageUrl = data.publicUrl;
      }

      const { error: identityError } = await supabase.rpc("set_team_identity", {
        p_team_id: team.id,
        p_image_url: imageUrl,
        p_banner_color: bannerColor,
        p_abbreviation: abbreviation,
      });
      if (identityError) {
        if (uploadedObjectPath) {
          try {
            await supabase.storage.from("team-images").remove([uploadedObjectPath]);
          } catch {
            // Cleanup is best-effort; retain the database update error.
          }
        }
        setForm(team.id, { status: { kind: "error", message: messageFor(identityError) } });
        return;
      }

      const captainProfileId = form.captainProfileId || null;
      const division = form.division || null;
      const ownerFieldsChanged =
        name !== team.name ||
        captainProfileId !== team.captain_profile_id ||
        division !== team.division;

      if (ownerFieldsChanged) {
        // name / captain_profile_id / division are draft-setup attributes and
        // owner-tier by design: set_team_identity deliberately cannot carry
        // them. RLS lets a plain admin's UPDATE run without raising, but it
        // affects zero rows, so an empty `.select("id")` result is the only
        // signal that the write was refused.
        const { data: updatedRows, error: ownerFieldsError } = await supabase
          .from("teams")
          .update({ name, captain_profile_id: captainProfileId, division })
          .eq("id", team.id)
          .eq("draft_id", draftId)
          .select("id");
        if (ownerFieldsError || !updatedRows || updatedRows.length === 0) {
          // The crest write above already landed (set_team_identity is admin-
          // callable), so the previous object must still be cleaned up even
          // though the owner-only fields were refused -- otherwise a
          // non-owner admin who both uploads a crest and renames a team in
          // one submit orphans the old storage object forever.
          if (uploadedObjectPath && previousObjectPath && previousObjectPath !== uploadedObjectPath) {
            try {
              await supabase.storage.from("team-images").remove([previousObjectPath]);
            } catch {
              // The replacement is already persisted; old-object cleanup is best-effort.
            }
          }
          setForm(team.id, {
            status: {
              kind: "error",
              message: ownerFieldsError
                ? messageFor(ownerFieldsError)
                : "Renaming a team, reassigning a captain, or changing division is owner-only.",
            },
          });
          return;
        }
      }

      if (uploadedObjectPath && previousObjectPath && previousObjectPath !== uploadedObjectPath) {
        try {
          await supabase.storage.from("team-images").remove([previousObjectPath]);
        } catch {
          // The replacement is already persisted; old-object cleanup is best-effort.
        }
      }

      setForm(team.id, {
        name,
        abbreviation,
        bannerColor,
        currentImageUrl: imageUrl,
        selectedFile: null,
        status: { kind: "success", message: "Team saved." },
      });
      router.refresh();
    } catch (error) {
      if (uploadedObjectPath) {
        try {
          await supabase.storage.from("team-images").remove([uploadedObjectPath]);
        } catch {
          // The database update already failed; cleanup must not hide that error.
        }
      }
      setForm(team.id, { status: { kind: "error", message: messageFor(error) } });
    }
  };

  const removePicture = async (team: Team) => {
    const form = forms[team.id];
    if (!form || form.status.kind === "saving") return;

    const objectPath = managedObjectPath(form.currentImageUrl, draftId, team.id);
    setForm(team.id, { status: { kind: "saving" } });
    try {
      const { error } = await supabase.rpc("set_team_identity", {
        p_team_id: team.id,
        p_image_url: null,
        p_banner_color: null,
        p_abbreviation: null,
      });
      if (error) {
        setForm(team.id, { status: { kind: "error", message: messageFor(error) } });
        return;
      }

      if (objectPath) {
        try {
          await supabase.storage.from("team-images").remove([objectPath]);
        } catch {
          // The database no longer references this object; cleanup is best-effort.
        }
      }

      setForm(team.id, {
        currentImageUrl: null,
        selectedFile: null,
        status: { kind: "success", message: "Picture removed." },
      });
      router.refresh();
    } catch (error) {
      setForm(team.id, { status: { kind: "error", message: messageFor(error) } });
    }
  };

  const saveAll = () => {
    void Promise.all(teams.map((team) => saveTeam(team)));
  };

  if (!editing) {
    return (
      <>
        <div className="mb-5 flex justify-end">
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="rounded border border-coral px-3 py-2 text-sm font-semibold text-coral hover:bg-coral hover:text-navy focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-coral"
          >
            Edit teams
          </button>
        </div>
        {children}
      </>
    );
  }

  return (
    <section className="flex flex-col gap-4" aria-label="Edit teams">
      <div className="flex items-center justify-between gap-3">
        <h2 className="label-dash">Edit teams</h2>
        <div className="flex flex-wrap justify-end gap-2">
          <button
            type="button"
            onClick={saveAll}
            disabled={isSavingAll}
            className="rounded bg-coral px-3 py-2 text-sm font-semibold text-navy hover:brightness-110 disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-coral"
          >
            {isSavingAll ? "Saving all…" : "Save all"}
          </button>
          <button
            type="button"
            onClick={() => setEditing(false)}
            className="rounded border border-line px-3 py-2 text-sm font-semibold text-white hover:border-coral hover:text-coral focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-coral"
          >
            Done editing teams
          </button>
        </div>
      </div>

      {teams.map((team) => {
        const form = forms[team.id];
        const isSaving = form.status.kind === "saving";
        const prefix = `team-${team.id}`;
        const colorPickerValue = isHexBannerColor(form.bannerColor)
          ? form.bannerColor
          : normalizeBannerColor(team.banner_color);
        return (
          <form
            key={team.id}
            aria-label={`Edit ${team.name}`}
            onSubmit={(event) => {
              event.preventDefault();
              void saveTeam(team);
            }}
            className="card-brand flex flex-col gap-4 p-4"
          >
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
              <label className="flex flex-col gap-1 text-xs text-steel" htmlFor={`${prefix}-name`}>
                Team name
                <input
                  id={`${prefix}-name`}
                  aria-label={`${team.name} name`}
                  value={form.name}
                  disabled={isSaving}
                  onChange={(event) => setForm(team.id, { name: event.target.value, status: { kind: "idle" } })}
                  className="rounded border border-line bg-navy px-3 py-2 text-sm text-white focus:border-coral focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-coral"
                />
              </label>
              <label className="flex flex-col gap-1 text-xs text-steel" htmlFor={`${prefix}-abbreviation`}>
                Abbreviation
                <input
                  id={`${prefix}-abbreviation`}
                  aria-label={`${team.name} abbreviation`}
                  value={form.abbreviation}
                  disabled={isSaving}
                  onChange={(event) =>
                    setForm(team.id, { abbreviation: event.target.value.toUpperCase(), status: { kind: "idle" } })
                  }
                  className="rounded border border-line bg-navy px-3 py-2 text-sm uppercase text-white focus:border-coral focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-coral"
                />
              </label>
              <label className="flex flex-col gap-1 text-xs text-steel" htmlFor={`${prefix}-captain`}>
                Captain
                <select
                  id={`${prefix}-captain`}
                  aria-label={`${team.name} captain`}
                  value={form.captainProfileId}
                  disabled={isSaving}
                  onChange={(event) =>
                    setForm(team.id, { captainProfileId: event.target.value, status: { kind: "idle" } })
                  }
                  className="rounded border border-line bg-navy px-3 py-2 text-sm text-white focus:border-coral focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-coral"
                >
                  <option value="">— none —</option>
                  {profiles.map((profile) => (
                    <option key={profile.id} value={profile.id}>
                      {profile.display_name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1 text-xs text-steel" htmlFor={`${prefix}-division`}>
                Division
                <select
                  id={`${prefix}-division`}
                  aria-label={`${team.name} division`}
                  value={form.division}
                  disabled={isSaving}
                  onChange={(event) =>
                    setForm(team.id, {
                      division: event.target.value as TeamFormState["division"],
                      status: { kind: "idle" },
                    })
                  }
                  className="rounded border border-line bg-navy px-3 py-2 text-sm text-white focus:border-coral focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-coral"
                >
                  <option value="">Unassigned</option>
                  <option value="Lunari">Lunari</option>
                  <option value="Solari">Solari</option>
                </select>
              </label>
              <div className="flex flex-col gap-1 text-xs text-steel">
                <span>Banner color</span>
                <div className="flex gap-2">
                  <input
                    id={`${prefix}-banner-color`}
                    aria-label={`${team.name} banner color`}
                    type="color"
                    value={colorPickerValue}
                    disabled={isSaving}
                    onChange={(event) =>
                      setForm(team.id, { bannerColor: event.target.value, status: { kind: "idle" } })
                    }
                    className="h-10 w-12 shrink-0 cursor-pointer rounded border border-line bg-navy p-1 disabled:cursor-not-allowed disabled:opacity-50"
                  />
                  <input
                    id={`${prefix}-banner-hex-code`}
                    aria-label={`${team.name} banner hex code`}
                    value={form.bannerColor}
                    disabled={isSaving}
                    maxLength={7}
                    placeholder="#083344"
                    spellCheck={false}
                    onChange={(event) =>
                      setForm(team.id, { bannerColor: event.target.value, status: { kind: "idle" } })
                    }
                    className="min-w-0 flex-1 rounded border border-line bg-navy px-3 py-2 font-mono text-sm text-white focus:border-coral focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-coral disabled:opacity-50"
                  />
                </div>
              </div>
              <label className="flex flex-col gap-1 text-xs text-steel" htmlFor={`${prefix}-image`}>
                Team image
                <input
                  id={`${prefix}-image`}
                  aria-label={`${team.name} image`}
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/gif"
                  disabled={isSaving}
                  onChange={(event) =>
                    setForm(team.id, { selectedFile: event.target.files?.[0] ?? null, status: { kind: "idle" } })
                  }
                  className="text-sm text-steel file:mr-3 file:rounded file:border-0 file:bg-coral file:px-3 file:py-2 file:text-xs file:font-semibold file:text-navy hover:file:brightness-110 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-coral"
                />
              </label>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <button
                type="submit"
                disabled={isSaving}
                className="rounded bg-coral px-3 py-2 text-sm font-semibold text-navy hover:brightness-110 disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-coral"
              >
                {isSaving ? "Saving…" : `Save ${team.name}`}
              </button>
              {form.currentImageUrl || form.selectedFile ? (
                <button
                  type="button"
                  disabled={isSaving}
                  onClick={() => void removePicture(team)}
                  className="rounded border border-red-500/60 px-3 py-2 text-sm font-semibold text-red-400 hover:border-red-400 disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-coral"
                >
                  Remove picture
                </button>
              ) : null}
              <p role="status" aria-live="polite" className="min-h-5 text-sm text-steel">
                {form.status.kind === "saving"
                  ? "Saving team…"
                  : form.status.kind === "idle"
                    ? null
                    : form.status.message}
              </p>
            </div>
          </form>
        );
      })}
    </section>
  );
}

export default function AdminTeamEditor(props: AdminTeamEditorProps) {
  return <DraftTeamEditor key={props.draftId} {...props} />;
}
