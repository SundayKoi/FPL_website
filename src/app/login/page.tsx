"use client";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

const isLocal =
  process.env.NODE_ENV !== "production" ||
  (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").includes("127.0.0.1");

export default function LoginPage() {
  const supabase = createClient();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState<string | null>(null);

  return (
    <main className="mx-auto mt-24 flex max-w-sm flex-col gap-4">
      <button
        className="rounded bg-indigo-600 px-4 py-2 font-semibold text-white"
        onClick={() =>
          supabase.auth.signInWithOAuth({
            provider: "discord",
            options: { redirectTo: `${location.origin}/auth/callback` },
          })
        }
      >
        Sign in with Discord
      </button>
      {isLocal && (
        <form
          className="flex flex-col gap-2 border-t pt-4"
          onSubmit={async (e) => {
            e.preventDefault();
            const { error } = await supabase.auth.signInWithPassword({ email, password });
            if (error) setErr(error.message);
            else location.href = "/";
          }}
        >
          <p className="text-sm opacity-60">Dev sign-in (local only)</p>
          <input className="rounded border p-2" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="email" />
          <input className="rounded border p-2" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="password" />
          <button className="rounded bg-zinc-700 px-4 py-2 text-white">Sign in</button>
          {err && <p className="text-sm text-red-500">{err}</p>}
        </form>
      )}
    </main>
  );
}
