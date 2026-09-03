import type { Metadata } from "next";
import SupportDevSection from "@/components/info/SupportDevSection";

export const metadata: Metadata = {
  title: "Support the Devs — FPL",
};

export default function SupportDevsPage() {
  return (
    <main className="page-backdrop flex-1">
      <div className="mx-auto w-full max-w-7xl px-4 py-12 sm:px-6 sm:py-16">
        <header className="max-w-3xl">
          <span className="label-dash">THE SUPPORT DESK</span>
          <h1 className="type-display mt-3 text-5xl sm:text-6xl">Support the Devs</h1>
          <hr className="accent-rule mt-5 w-48 sm:w-64" />
          <p className="mt-4 text-lg leading-8 text-muted">
            Help keep the FPL league site, broadcasts, and tools running.
          </p>
        </header>

        <SupportDevSection className="mt-10" />
      </div>
    </main>
  );
}
