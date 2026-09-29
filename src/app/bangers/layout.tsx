import type { ReactNode } from "react";
import PlayPageShell from "@/components/play/PlayPageShell";

export default function BangersLayout({ children }: { children: ReactNode }) {
  return <PlayPageShell league="premier" active="daily-stu">{children}</PlayPageShell>;
}
