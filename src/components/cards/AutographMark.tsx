import Image from "next/image";
import styles from "./AutographMark.module.css";

export type AutographPlacement = "standard" | "large" | "champions" | "team";

export interface AutographMarkProps {
  /** The untouched player-drawn PNG data URI. */
  src: string | null | undefined;
  /** A useful description, or "" when the mark is decorative in context. */
  alt: string;
  placement: AutographPlacement;
  /** The existing player-card write-on class, when the mark should animate. */
  animationClassName?: string;
  /** Keep the player-card pen glint paired with its write-on animation. */
  showPen?: boolean;
  /** Optional test hooks for the containing stage and source image. */
  testId?: string;
  imageTestId?: string;
  /** Responsive hint for next/image callers whose stage has a known size. */
  sizes?: string;
}

/**
 * One renderer for every real autograph. The source is passed through as-is;
 * all contrast work belongs to the stage and the neutral drop shadows.
 */
export default function AutographMark({
  src,
  alt,
  placement,
  animationClassName,
  showPen = false,
  testId,
  imageTestId,
  sizes = "50vw",
}: AutographMarkProps) {
  if (!src) return null;

  return (
    <span
      className={[styles.stage, styles[placement]].filter(Boolean).join(" ")}
      data-testid={testId}
    >
      <Image
        src={src}
        alt={alt}
        width={480}
        height={160}
        sizes={sizes}
        unoptimized
        decoding="async"
        data-testid={imageTestId}
        aria-hidden={alt === "" ? true : undefined}
        className={[styles.ink, animationClassName].filter(Boolean).join(" ")}
      />
      {showPen ? <span aria-hidden data-testid="autograph-pen" className="card-ink-pen" /> : null}
    </span>
  );
}
