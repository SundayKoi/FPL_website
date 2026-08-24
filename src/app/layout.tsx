import type { Metadata } from "next";
import { Chakra_Petch, Saira } from "next/font/google";
import AuthButton from "@/components/AuthButton";
import SiteNavigation from "@/components/SiteNavigation";
import SupportDevButton from "@/components/SupportDevButton";
import { createServerSupabase } from "@/lib/supabase/server";
import { canAccessBroadcaster, fetchStaffTier } from "@/lib/auth/staffTier";
import { resolveMetadataBase } from "@/lib/metadataBase";
import "./globals.css";

const chakra = Chakra_Petch({
  subsets: ["latin"],
  weight: ["600", "700"],
  style: ["normal", "italic"],
  variable: "--font-chakra",
});
const saira = Saira({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-saira",
});

export const metadata: Metadata = {
  // Without this, the share page's relative openGraph.images resolves
  // against VERCEL_URL or localhost rather than the real domain.
  metadataBase: resolveMetadataBase(process.env.NEXT_PUBLIC_SITE_URL),
  title: "FPL Draft League",
  description:
    "Franchise Premier League draft hub for live broadcasts, league updates, and active drafts.",
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  // Nav-level staff check — presentation only (the /admin page re-checks and
  // redirects; database policies are the real gate). fetchStaffTier fails
  // closed, so signed-out visitors and query errors just hide the link.
  const tier = await fetchStaffTier(await createServerSupabase());
  return (
    <html
      lang="en"
      className={`${chakra.variable} ${saira.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-navy text-white font-body antialiased">
        <SiteNavigation
          authSlot={<AuthButton />}
          showAdmin={tier.isAdmin || tier.isOwner || tier.isBroadcaster}
          showBroadcaster={canAccessBroadcaster(tier)}
        />
        {children}
        <SupportDevButton />
      </body>
    </html>
  );
}
