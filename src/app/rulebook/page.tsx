import type { Metadata } from "next";
import AboutPageHeader from "@/components/info/AboutPageHeader";
import AboutPageShell from "@/components/info/AboutPageShell";
import RulebookContent from "@/components/info/RulebookContent";
import { getInfoPageData, getRulebookResource, rulebookSections } from "@/lib/info/resources";
import styles from "./RulebookPage.module.css";

export const metadata: Metadata = {
  title: "Rules — FPL",
  description: "The official FPL Premier rulebook, with every section and the source document.",
};

function SectionLinks() {
  return (
    <ol className={styles.sectionLinks}>
      {rulebookSections.map(([label, id]) => (
        <li key={id}><a href={`#${id}`}>{label}</a></li>
      ))}
    </ol>
  );
}

export default async function RulebookPage() {
  const { resources } = await getInfoPageData();
  const rulebook = getRulebookResource(resources);

  return (
    <AboutPageShell activeHref="/rulebook">
      <AboutPageHeader
        eyebrow="Official document"
        title="Rules"
        description="The full Premier rulebook and its original source document. Existing section links remain available for bookmarked rules."
      >
        <a href={rulebook.href} rel="noopener noreferrer" target="_blank" className="btn-pill inline-flex items-center rounded-full px-4 py-2 text-sm font-semibold">
          Open source Google Doc ↗
        </a>
      </AboutPageHeader>

      <div className={styles.layout}>
        <nav aria-label="Rulebook sections" className={styles.desktopContents}>
          <p className={styles.contentsTitle}>On this page</p>
          <SectionLinks />
        </nav>
        <details className={styles.mobileContents}>
          <summary>Rulebook sections</summary>
          <SectionLinks />
        </details>
        <div className={styles.article}>
          <RulebookContent />
        </div>
      </div>
    </AboutPageShell>
  );
}
