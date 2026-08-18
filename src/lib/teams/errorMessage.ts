/**
 * Human-readable message from an unknown thrown value — Supabase failures
 * arrive as Error instances, strings, or plain `{ message }` objects
 * depending on the code path. Shared by the admin editors, which differ
 * only in their fallback copy.
 */
export function errorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return (error as { message?: string } | null)?.message ?? fallback;
}
