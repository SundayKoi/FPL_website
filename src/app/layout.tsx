import type { Metadata } from "next";
import { Chakra_Petch, Saira } from "next/font/google";
import AuthButton from "@/components/AuthButton";
import SiteNavigation from "@/components/SiteNavigation";
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
  title: "FPL Draft League",
  description:
    "Franchise Premier League draft hub for live broadcasts, league updates, and active drafts.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${chakra.variable} ${saira.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-navy text-white font-body antialiased">
        <SiteNavigation authSlot={<AuthButton />} />
        {children}
      </body>
    </html>
  );
}
