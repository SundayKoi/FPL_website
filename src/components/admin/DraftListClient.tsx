"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import type { Draft } from "@/lib/draft/types";

export default function DraftListClient({ initialDrafts }: { initialDrafts: Draft[] }) {
  const supabase = createClient();
  const router = useRouter();
  const [drafts, setDrafts] = useState<Draft[]>(initialDrafts);
  const [name, setName] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const refetch = async () => {
    const { data } = await supabase.from("drafts").select("*").order("created_at", { ascending: false });
    setDrafts((data as Draft[]) ?? []);
  };

  const createDraft = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    setErr(null);
    const { data, error } = await supabase
      .from("drafts")
      .insert({ name: name.trim() })
      .select()
      .single();
    setBusy(false);
    if (error) {
      setErr(error.message);
      return;
    }
    router.push(`/admin/${(data as Draft).id}`);
  };

  const deleteDraft = async (draft: Draft) => {
    if (draft.status !== "setup") return;
    if (!confirm(`Delete draft "${draft.name}"? This cannot be undone.`)) return;
    const { error } = await supabase.from("drafts").delete().eq("id", draft.id);
    if (error) {
      setErr(error.message);
      return;
    }
    await refetch();
  };

  return (
    <div className="flex flex-col gap-6">
      <form onSubmit={createDraft} className="flex gap-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="New draft name"
          className="flex-1 rounded border border-zinc-700 bg-black/30 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600"
        />
        <button
          type="submit"
          disabled={busy || !name.trim()}
          className="rounded bg-indigo-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
        >
          New draft
        </button>
      </form>
      {err && <p className="text-sm text-red-400">{err}</p>}

      {drafts.length === 0 ? (
        <p className="text-sm opacity-60">No drafts yet.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {drafts.map((draft) => (
            <li
              key={draft.id}
              className="flex items-center justify-between gap-2 rounded-lg border border-zinc-800 px-4 py-3"
            >
              <Link href={`/admin/${draft.id}`} className="flex flex-1 items-center justify-between gap-2">
                <span className="font-medium text-zinc-100">{draft.name}</span>
                <span className="text-xs uppercase tracking-wide opacity-60">{draft.status}</span>
              </Link>
              {draft.status === "setup" && (
                <button
                  onClick={() => deleteDraft(draft)}
                  className="shrink-0 rounded bg-red-800 px-2 py-1 text-xs font-semibold text-white"
                >
                  Delete
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
