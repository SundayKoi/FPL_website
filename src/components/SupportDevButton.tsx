import Image from "next/image";
import Link from "next/link";

export default function SupportDevButton() {
  return (
    <Link
      href="/info#support-devs"
      aria-label="Support the devs"
      title="Support the devs"
      className="fixed bottom-4 left-4 z-40 rounded-xl border border-gold/60 bg-navy/95 p-1.5 shadow-lg shadow-black/40 backdrop-blur transition hover:border-coral hover:bg-panel focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-coral sm:bottom-6 sm:left-6"
    >
      <Image
        src="/support-devs-emoji.jpg"
        alt="Support the devs"
        width={165}
        height={115}
        sizes="64px"
        className="h-12 w-auto rounded-lg object-cover sm:h-14"
      />
    </Link>
  );
}
