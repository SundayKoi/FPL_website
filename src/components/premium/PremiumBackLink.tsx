import Link from "next/link";

export default function PremiumBackLink() {
  return (
    <Link
      href="/premium"
      className="inline-flex text-sm font-semibold text-primary transition hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
    >
      {"<-- back to Premium HQ"}
    </Link>
  );
}
