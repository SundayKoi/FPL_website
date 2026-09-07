import AccessWall, { PREMIUM_GATE_TITLE, type AccessReason } from "@/components/access/AccessWall";
import { PREMIUM_NAME } from "@/lib/site/discord";

export { PREMIUM_GATE_TITLE };

/** The sentence every gated cards page says when the viewer lacks the role. */
export const PREMIUM_GATE_BODY = `Cards are part of ${PREMIUM_NAME}. Join the Discord, grab the role, and come back — card links you've been sent still work without it.`;

/**
 * The cards pages' wall — AccessWall with the cards defaults filled in.
 * `browse` is no longer optional in spirit: a wall that only said "no" was
 * hiding the one door that is unlocked, so every cards wall points at
 * Browse unless told otherwise.
 */
export default function CardsGate({
  section,
  title,
  body,
  signIn,
  reason,
  browse,
  note,
}: {
  section: string;
  title?: string;
  body?: string;
  /** Where to land after signing in. Passing it means the viewer is signed
   *  out; the wall offers the sign-in button. */
  signIn?: string;
  /** Explicit reason; inferred from `signIn` when absent. */
  reason?: AccessReason;
  /** The public way in. Defaults to the premier Browse; pass the academy
   *  one on academy pages, or `null` for a wall outside the cards section. */
  browse?: string | null;
  note?: string;
}) {
  return (
    <AccessWall
      section={section}
      reason={reason ?? (signIn ? "signed-out" : "no-role")}
      redirect={signIn ?? "/cards"}
      title={title}
      body={body}
      browse={browse === null ? undefined : browse ?? "/cards/browse"}
      note={note}
    />
  );
}
