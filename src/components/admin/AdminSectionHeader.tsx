import Link from "next/link";
import type { ReactNode } from "react";

export default function AdminSectionHeader({
  title,
  description,
  children,
  backHref = "/admin",
}: {
  title: string;
  description: string;
  children?: ReactNode;
  backHref?: string;
}) {
  return (
    <header className="flex flex-col gap-4 border-b border-border-subtle pb-5">
      <Link href={backHref} className="w-fit text-xs font-semibold uppercase tracking-[0.14em] text-muted hover:text-action-text focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4">
        ← Admin overview
      </Link>
      <div>
        <h1 className="type-display text-3xl text-content sm:text-4xl">{title}</h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-muted">{description}</p>
      </div>
      {children}
    </header>
  );
}
