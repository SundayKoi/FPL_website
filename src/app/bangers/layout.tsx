import type { ReactNode } from "react";
import PremiumBackLink from "@/components/premium/PremiumBackLink";

export default function BangersLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-1 flex-col">
      <div className="mx-auto w-full max-w-6xl px-5 pt-5 sm:px-10">
        <PremiumBackLink />
      </div>
      {children}
    </div>
  );
}
