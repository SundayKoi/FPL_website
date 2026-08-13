import { NextResponse } from "next/server";
import { resolveSiteOrigin } from "@/lib/auth/siteOrigin";
import { createServerSupabase } from "@/lib/supabase/server";

/** Only a same-site path is ever honored as a post-auth redirect target —
 * anything else (an absolute URL, protocol-relative "//evil.com", etc.)
 * would be an open redirect via a crafted `next` query param. */
export function safeNextPath(next: string | null): string {
  if (!next) return "/";
  if (!next.startsWith("/") || next.startsWith("//")) return "/";
  return next;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  if (code) {
    const supabase = await createServerSupabase();
    await supabase.auth.exchangeCodeForSession(code);
  }
  // Redirect to the canonical origin (else the user-facing forwarded host)
  // rather than url.origin — behind Vercel's proxy, request.url can carry
  // the internal deployment host instead of the domain the user is on.
  const origin = resolveSiteOrigin(
    process.env.NEXT_PUBLIC_SITE_URL,
    request.headers.get("x-forwarded-host"),
    request.headers.get("x-forwarded-proto"),
    url.origin,
  );
  const next = safeNextPath(url.searchParams.get("next"));
  return NextResponse.redirect(new URL(next, origin));
}
