import type { ReactNode } from "react";
import PremiumBackLink from "@/components/premium/PremiumBackLink";

export default function DrafterLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-1 flex-col">
      <div className="page-container pt-5">
        <PremiumBackLink />
      </div>
      {children}
    </div>
  );
}
