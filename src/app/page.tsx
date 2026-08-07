import Link from "next/link";

export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-6 py-16">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">FPL Draft League</h1>
        <Link href="/admin" className="underline">
          Admin
        </Link>
      </div>
      <p className="text-sm opacity-60">
        Draft list coming soon.
      </p>
    </main>
  );
}
