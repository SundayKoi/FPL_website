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
    if (!confirm(`Delete draft "${draft.name}"? This cannot be undone.`)) return;
    const { data, error } = await supabase
      .from("drafts")
      .delete()
      .eq("id", draft.id)
      .select();
    if (error) {
      setErr(error.message);
      return;
    }
    if (!data || data.length === 0) {
      setErr("Draft could not be deleted — refresh.");
      await refetch();
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
          className="flex-1 rounded border border-line bg-navy px-3 py-2 text-sm text-white placeholder:text-steel/60 focus:border-gold focus:outline-none"
        />
        <button
          type="submit"
          disabled={busy || !name.trim()}
          className="rounded bg-gold px-4 py-2 text-sm font-display font-bold not-italic text-navy hover:brightness-110 disabled:opacity-40"
        >
          New draft
        </button>
      </form>
      {err && <p className="text-sm text-red-400">{err}</p>}

      {drafts.length === 0 ? (
        <p className="text-sm text-steel">No drafts yet.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {drafts.map((draft) => (
            <li
              key={draft.id}
              className="card-brand flex items-center justify-between gap-2 px-4 py-3"
            >
              <Link href={`/admin/${draft.id}`} className="flex flex-1 items-center justify-between gap-2">
                <span className="font-medium text-white">{draft.name}</span>
                <span className="text-xs uppercase tracking-wide text-steel">{draft.status}</span>
              </Link>
              <button
                onClick={() => deleteDraft(draft)}
                className="shrink-0 rounded border border-red-500/60 px-2 py-1 text-xs font-semibold text-red-400"
              >
                Delete
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
