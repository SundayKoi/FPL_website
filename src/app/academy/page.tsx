import type { Metadata } from "next";
import AcademyHomePage from "@/components/home/AcademyHomePage";

export const metadata: Metadata = {
  title: "FPL Academy",
};

export default function AcademyHome() {
  return <AcademyHomePage />;
}
