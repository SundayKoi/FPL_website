"use server";

import { revalidatePath } from "next/cache";
import { createBettingServiceClient } from "@/lib/betting/service-client";
import { getBettingUser } from "@/lib/betting/wallet";
import { normalizeRule, type AutoDustRule } from "./autoDust";
import { runAutoDustOnCollection, saveAutoDustRule } from "./autoDustServer";

export type AutoDustSaveResult = { ok: true; rule: AutoDustRule } | { ok: false; error: string };
export type AutoDustRunResult =
  | { ok: true; dusted: number; value: number; skipped: number; remaining: number; balance: number | null }
  | { ok: false; error: string };

/** Save the collector's standing rule. Returns it normalized. */
export async function saveAutoDustRuleAction(input: unknown): Promise<AutoDustSaveResult> {
  const user = await getBettingUser();
  if (!user) return { ok: false, error: "Sign in with Discord to use the betting site." };
  if (!user.allowed) return { ok: false, error: "FPL Better members only." };
  const rule = normalizeRule(typeof input === "object" && input !== null ? (input as Partial<AutoDustRule>) : null);
  try {
    await saveAutoDustRule(createBettingServiceClient(), user.discordId, rule);
  } catch (error) {
    return { ok: false, error: `Couldn't save the rule (${error instanceof Error ? error.message : String(error)}).` };
  }
  return { ok: true, rule };
}

/** Run the saved rule over the whole shelf now. */
export async function runAutoDustAction(): Promise<AutoDustRunResult> {
  const user = await getBettingUser();
  if (!user) return { ok: false, error: "Sign in with Discord to use the betting site." };
  if (!user.allowed) return { ok: false, error: "FPL Better members only." };
  try {
    const result = await runAutoDustOnCollection(createBettingServiceClient(), user.discordId);
    revalidatePath("/cards", "layout");
    return { ok: true, ...result };
  } catch (error) {
    return { ok: false, error: `Couldn't run the rule (${error instanceof Error ? error.message : String(error)}).` };
  }
}
