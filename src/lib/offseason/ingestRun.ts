// The admin's "Ingest now" button: starts the "Ingest offseason games"
// workflow (.github/workflows/offseason-ingest.yml) on main and reads how its
// latest run went. GitHub takes this only with a token, GITHUB_ACTIONS_TOKEN:
// a fine-grained token for this repository with Actions read and write. Only
// the server actions (actions.ts) read the token and call these, after
// checking the caller is staff.

const REPO = "SundayKoi/FPL_website";
const WORKFLOW = "offseason-ingest.yml";
const REF = "main";

/** Where staff run it by hand when the button isn't set up. */
export const INGEST_WORKFLOW_URL = `https://github.com/${REPO}/actions/workflows/${WORKFLOW}`;

/** One run of the workflow, as the button shows it. Plain data, for the client. */
export interface IngestRun {
  id: number;
  /** queued, in_progress or completed, or one of GitHub's waiting states. */
  status: string;
  /** success, failure, cancelled and so on, once completed. */
  conclusion: string | null;
  createdAt: string;
  url: string;
}

/** A refusal from GitHub, worded for the admin. */
export class IngestError extends Error {}

async function github(path: string, token: string, init: RequestInit = {}): Promise<Response> {
  const response = await fetch(`https://api.github.com/repos/${REPO}/actions/workflows/${WORKFLOW}${path}`, {
    ...init,
    cache: "no-store",
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "X-GitHub-Api-Version": "2022-11-28",
      ...(init.body ? { "Content-Type": "application/json" } : {}),
    },
  });
  if (!response.ok) {
    throw new IngestError(
      [401, 403, 404].includes(response.status)
        ? `GitHub refused the token (${response.status}): it needs Actions read and write on ${REPO}.`
        : `GitHub answered ${response.status}. Try again in a minute.`,
    );
  }
  return response;
}

/** The workflow's most recent run started by hand or by the button, if any. */
export async function latestIngestRun(token: string): Promise<IngestRun | null> {
  const response = await github("/runs?event=workflow_dispatch&per_page=1", token);
  const body = (await response.json()) as {
    workflow_runs?: { id: number; status: string; conclusion: string | null; created_at: string; html_url: string }[];
  };
  const run = body.workflow_runs?.[0];
  return run ? { id: run.id, status: run.status, conclusion: run.conclusion, createdAt: run.created_at, url: run.html_url } : null;
}

/** Starts the workflow for every pending game. GitHub lists the run a few seconds later. */
export async function startIngest(token: string): Promise<void> {
  await github("/dispatches", token, { method: "POST", body: JSON.stringify({ ref: REF, inputs: { game_id: "" } }) });
}
