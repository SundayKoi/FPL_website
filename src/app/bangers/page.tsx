import type { Metadata } from "next";
import BangerBoard from "@/components/bangers/BangerBoard";
import { fetchBangerPosts } from "@/lib/bangers/queries";

export const metadata: Metadata = {
  title: "Banger Board | FPL Draft League",
  description: "Rate the recent and greatest takes from Stuart69Davis.",
};

export default async function BangersPage() {
  return <BangerBoard posts={await fetchBangerPosts()} />;
}
