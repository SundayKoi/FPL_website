import Image from "next/image";
import Link from "next/link";

export default function SupportDevButton() {
  return (
    <Link
      href="/support-devs"
      aria-label="Support the devs"
      title="Support the devs"
      className="fixed bottom-4 left-4 z-40 flex h-10 w-10 overflow-hidden rounded-full border border-gold/60 bg-navy/95 shadow-lg shadow-black/40 backdrop-blur transition hover:border-coral hover:bg-panel focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-coral sm:bottom-6 sm:left-6 sm:h-11 sm:w-11"
    >
      <Image
        src="/support-devs-emoji.jpg"
        alt="Support the devs"
        width={165}
        height={115}
        sizes="44px"
        className="h-full w-full object-cover"
      />
    </Link>
  );
}
