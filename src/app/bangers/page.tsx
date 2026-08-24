import type { Metadata } from "next";
import BangerBoard from "@/components/bangers/BangerBoard";

export const metadata: Metadata = {
  title: "Banger Board | FPL Draft League",
  description: "Rate the recent and greatest takes from Stuart69Davis.",
};

export default function BangersPage() {
  return <BangerBoard />;
}
