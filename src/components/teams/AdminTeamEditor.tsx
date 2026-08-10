"use client";

import { useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { Profile, Team } from "@/lib/draft/types";

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

  const saveTeam = async (team: Team) => {
    const form = forms[team.id];
    if (!form || form.status.kind === "saving") return;

    const name = form.name.trim();
    const abbreviation = form.abbreviation.trim().toUpperCase();
    if (!name || !/^[A-Z0-9]{1,5}$/.test(abbreviation)) {
      setForm(team.id, {
        abbreviation,
        status: {
          kind: "error",
          message: "Enter a team name, an abbreviation of 1–5 characters, and an allowed image file.",
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
    setForm(team.id, { abbreviation, status: { kind: "saving" } });

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

      const { data: updatedTeam, error } = await supabase
        .from("teams")
        .update({
          name,
          abbreviation,
          captain_profile_id: form.captainProfileId || null,
          image_url: imageUrl,
        })
        .eq("id", team.id)
        .eq("draft_id", draftId)
        .select("id")
        .single();
      if (error || updatedTeam?.id !== team.id) {
        if (uploadedObjectPath) {
          try {
            await supabase.storage.from("team-images").remove([uploadedObjectPath]);
          } catch {
            // Cleanup is best-effort; retain the database update error.
          }
        }
        setForm(team.id, {
          status: {
            kind: "error",
            message: error ? messageFor(error) : "No matching team row was updated.",
          },
        });
        return;
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
      const { data: updatedTeam, error } = await supabase
        .from("teams")
        .update({ image_url: null })
        .eq("id", team.id)
        .eq("draft_id", draftId)
        .select("id")
        .single();
      if (error || updatedTeam?.id !== team.id) {
        setForm(team.id, {
          status: {
            kind: "error",
            message: error ? messageFor(error) : "No matching team row was updated.",
          },
        });
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

  if (!editing) {
    return (
      <>
        <div className="mb-5 flex justify-end">
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="rounded border border-gold px-3 py-2 text-sm font-semibold text-gold hover:bg-gold hover:text-navy focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold"
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
      <div className="flex items-center justify-between">
        <h2 className="label-dash">Edit teams</h2>
        <button
          type="button"
          onClick={() => setEditing(false)}
          className="rounded border border-line px-3 py-2 text-sm font-semibold text-white hover:border-gold hover:text-gold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold"
        >
          Done editing teams
        </button>
      </div>

      {teams.map((team) => {
        const form = forms[team.id];
        const isSaving = form.status.kind === "saving";
        const prefix = `team-${team.id}`;
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
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <label className="flex flex-col gap-1 text-xs text-steel" htmlFor={`${prefix}-name`}>
                Team name
                <input
                  id={`${prefix}-name`}
                  aria-label={`${team.name} name`}
                  value={form.name}
                  disabled={isSaving}
                  onChange={(event) => setForm(team.id, { name: event.target.value, status: { kind: "idle" } })}
                  className="rounded border border-line bg-navy px-3 py-2 text-sm text-white focus:border-gold focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold"
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
                  className="rounded border border-line bg-navy px-3 py-2 text-sm uppercase text-white focus:border-gold focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold"
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
                  className="rounded border border-line bg-navy px-3 py-2 text-sm text-white focus:border-gold focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold"
                >
                  <option value="">— none —</option>
                  {profiles.map((profile) => (
                    <option key={profile.id} value={profile.id}>
                      {profile.display_name}
                    </option>
                  ))}
                </select>
              </label>
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
                  className="text-sm text-steel file:mr-3 file:rounded file:border-0 file:bg-gold file:px-3 file:py-2 file:text-xs file:font-semibold file:text-navy hover:file:brightness-110 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold"
                />
              </label>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <button
                type="submit"
                disabled={isSaving}
                className="rounded bg-gold px-3 py-2 text-sm font-semibold text-navy hover:brightness-110 disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold"
              >
                {isSaving ? "Saving…" : `Save ${team.name}`}
              </button>
              {form.currentImageUrl || form.selectedFile ? (
                <button
                  type="button"
                  disabled={isSaving}
                  onClick={() => void removePicture(team)}
                  className="rounded border border-red-500/60 px-3 py-2 text-sm font-semibold text-red-400 hover:border-red-400 disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold"
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
