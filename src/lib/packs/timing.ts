import "server-only";

/**
 * Small, deliberately opt-in timings for pack openings. They are useful when
 * comparing a controlled local run, but must not turn normal pack opens into
 * a stream of per-user logs. The id is an opening/request UUID, never an
 * account identifier or card payload.
 */
const TIMING_ENABLED = process.env.PACK_OPEN_TIMING === "1";

export class PackOpenTiming {
  private readonly startedAt = performance.now();
  private readonly stages: Record<string, number> = {};

  constructor(
    private readonly openingId: string,
    private readonly kind: "action" | "core" | "champions" | "announcement",
  ) {}

  async measure<T>(stage: string, task: () => PromiseLike<T>): Promise<T> {
    if (!TIMING_ENABLED) return task();
    const startedAt = performance.now();
    try {
      return await task();
    } finally {
      this.stages[stage] = roundMs((this.stages[stage] ?? 0) + performance.now() - startedAt);
    }
  }

  log(outcome: "ok" | "error" = "ok"): void {
    if (!TIMING_ENABLED) return;
    console.info("packs: open timing", {
      openingId: this.openingId,
      kind: this.kind,
      outcome,
      stagesMs: this.stages,
      totalMs: roundMs(performance.now() - this.startedAt),
    });
  }
}

function roundMs(value: number): number {
  return Math.round(value * 10) / 10;
}
