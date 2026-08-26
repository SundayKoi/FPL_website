import type { ReactNode } from "react";
import PremiumBackLink from "@/components/premium/PremiumBackLink";

export default function CardsLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-1 flex-col">
      <div className="mx-auto w-full max-w-[1800px] px-4 pt-5 sm:px-6">
        <PremiumBackLink />
      </div>
      {children}
    </div>
  );
}
