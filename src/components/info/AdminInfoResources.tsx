"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export type InfoResource = {
  id: string;
  slug: string;
  label: string;
  description: string;
  href: string;
  sort_order: number;
};

export default function AdminInfoResources({ resources }: { resources: InfoResource[] }) {
  const router = useRouter();
  const [drafts, setDrafts] = useState(resources);
  const [status, setStatus] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const update = (id: string, field: keyof InfoResource, value: string) => {
    setDrafts((current) => current.map((resource) => resource.id === id ? { ...resource, [field]: value } : resource));
    setStatus(null);
  };

  const save = async () => {
    setSaving(true);
    setStatus(null);
    const supabase = createClient();
    const results = await Promise.all(
      drafts.map((resource) =>
        supabase
          .from("info_resources")
          .update({ label: resource.label, description: resource.description, href: resource.href, updated_at: new Date().toISOString() })
          .eq("id", resource.id),
      ),
    );
    const error = results.find((result) => result.error)?.error;
    setSaving(false);
    if (error) {
      setStatus(error.message);
      return;
    }
    setStatus("Resources saved.");
    router.refresh();
  };

  return (
    <section className="card-brand mt-10 p-5" aria-label="Edit league resources">
      <span className="label-dash">Admin</span>
      <h2 className="type-display mt-2 text-3xl">Edit linked resources</h2>
      <div className="mt-5 flex flex-col gap-5">
        {drafts.map((resource) => (
          <fieldset key={resource.id} className="grid gap-3 border-t border-line pt-4 md:grid-cols-3">
            <legend className="label-dash">{resource.slug}</legend>
            <label className="flex flex-col gap-1 text-xs text-steel">
              Label
              <input value={resource.label} onChange={(event) => update(resource.id, "label", event.target.value)} className="rounded border border-line bg-navy px-2 py-1.5 text-sm text-white focus:border-gold focus:outline-none" />
            </label>
            <label className="flex flex-col gap-1 text-xs text-steel">
              Description
              <input value={resource.description} onChange={(event) => update(resource.id, "description", event.target.value)} className="rounded border border-line bg-navy px-2 py-1.5 text-sm text-white focus:border-gold focus:outline-none" />
            </label>
            <label className="flex flex-col gap-1 text-xs text-steel">
              URL
              <input type="url" value={resource.href} onChange={(event) => update(resource.id, "href", event.target.value)} className="rounded border border-line bg-navy px-2 py-1.5 text-sm text-white focus:border-gold focus:outline-none" />
            </label>
          </fieldset>
        ))}
      </div>
      {status && <p className="mt-4 text-sm text-steel" role="status">{status}</p>}
      <button type="button" onClick={() => void save()} disabled={saving} className="mt-5 rounded-full bg-gold px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-navy disabled:opacity-50">
        {saving ? "Saving…" : "Save resources"}
      </button>
    </section>
  );
}
