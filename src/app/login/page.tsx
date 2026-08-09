"use client";
import { useState } from "react";
import Image from "next/image";
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
    <main className="bg-hash flex min-h-full flex-1 flex-col items-center justify-center gap-6 px-6 py-16">
      <div className="flex max-w-sm flex-1 flex-col items-center justify-center gap-6">
        <div className="flex flex-col items-center gap-3">
          <Image src="/fpl-logo.png" width={96} height={96} alt="" />
          <span className="type-display text-2xl">
            FPL <span className="text-steel font-body not-italic">DRAFT</span>
          </span>
        </div>
        <button
          className="btn-pill w-full"
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
            className="flex w-full flex-col gap-2 border-t border-line pt-4"
            onSubmit={async (e) => {
              e.preventDefault();
              const { error } = await supabase.auth.signInWithPassword({ email, password });
              if (error) setErr(error.message);
              else location.href = "/";
            }}
          >
            <p className="text-sm text-steel">Dev sign-in (local only)</p>
            <input
              className="rounded border border-line bg-navy p-2 text-white placeholder:text-steel/60 focus:border-gold focus:outline-none"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="email"
            />
            <input
              className="rounded border border-line bg-navy p-2 text-white placeholder:text-steel/60 focus:border-gold focus:outline-none"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="password"
            />
            <button className="rounded border border-steel text-steel px-4 py-2 hover:bg-steel/10">Sign in</button>
            {err && <p className="text-sm text-red-400">{err}</p>}
          </form>
        )}
      </div>
    </main>
  );
}
