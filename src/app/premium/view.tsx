import PremiumGate from "@/components/premium/PremiumGate";
import PremiumHub from "@/components/premium/PremiumHub";
import { premiumAccess } from "@/lib/premium/access";
import { loadPremiumHubSnapshot, loadPremiumPaymentHref, resolvePremiumLeague } from "@/lib/premium/preview";

export async function PremiumPageView({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const access = await premiumAccess();
  if (!access.signedIn || !access.allowed) {
    const paymentHref = await loadPremiumPaymentHref();
    return <PremiumGate signedIn={access.signedIn} paymentHref={paymentHref} />;
  }

  const query = await searchParams;
  const league = resolvePremiumLeague(query.league);
  const snapshot = await loadPremiumHubSnapshot(league);
  return <PremiumHub snapshot={snapshot} />;
}
