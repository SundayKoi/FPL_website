import PremiumGate from "@/components/premium/PremiumGate";
import PremiumHub from "@/components/premium/PremiumHub";
import { premiumAccess } from "@/lib/premium/access";
import { loadPremiumHubSnapshot, loadPremiumPaymentHref, resolvePremiumLeague } from "@/lib/premium/preview";
import PlayPageShell from "@/components/play/PlayPageShell";

export async function PremiumPageView({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const query = await searchParams;
  const league = resolvePremiumLeague(query.league);
  const redirectHref = league === "academy" ? "/premium?league=academy" : "/premium";
  const access = await premiumAccess();
  if (!access.signedIn || !access.allowed) {
    const paymentHref = await loadPremiumPaymentHref();
    return (
      <PlayPageShell league={league} active="premium" isAdmin={access.isAdmin}>
        <PremiumGate signedIn={access.signedIn} paymentHref={paymentHref} redirectHref={redirectHref} />
      </PlayPageShell>
    );
  }

  const snapshot = await loadPremiumHubSnapshot(league);
  return (
    <PlayPageShell league={league} active="premium" isAdmin={access.isAdmin}>
      <PremiumHub snapshot={snapshot} isAdmin={access.isAdmin} />
    </PlayPageShell>
  );
}
