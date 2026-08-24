import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const { registerDiscordCommands } = vi.hoisted(() => ({ registerDiscordCommands: vi.fn() }));
vi.mock("@/lib/betting/admin-actions", () => ({ registerDiscordCommands }));

import BotCommandsAdmin from "./BotCommandsAdmin";

afterEach(cleanup);

describe("BotCommandsAdmin", () => {
  it("registers on click and reports what Discord accepted", async () => {
    registerDiscordCommands.mockResolvedValue({ ok: true, registered: ["balance", "daily", "weekly"] });

    render(<BotCommandsAdmin />);
    fireEvent.click(screen.getByRole("button", { name: /register commands/i }));

    await waitFor(() => {
      expect(screen.getByRole("status").textContent).toContain("3 commands");
    });
    expect(screen.getByRole("status").textContent).toContain("weekly");
  });

  it("surfaces the action's error", async () => {
    registerDiscordCommands.mockResolvedValue({ ok: false, error: "Discord refused the command update (403)." });

    render(<BotCommandsAdmin />);
    fireEvent.click(screen.getByRole("button", { name: /register commands/i }));

    await waitFor(() => {
      expect(screen.getByRole("status").textContent).toContain("403");
    });
  });
});
