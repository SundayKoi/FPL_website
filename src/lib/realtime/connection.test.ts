import { describe, expect, it } from "vitest";
import { connectionStatusForChannel } from "./connection";

describe("connectionStatusForChannel", () => {
  it("marks a subscribed realtime channel as connected", () => {
    expect(connectionStatusForChannel("SUBSCRIBED")).toBe("connected");
  });

  it.each(["CHANNEL_ERROR", "TIMED_OUT", "CLOSED"])(
    "marks %s as an interrupted connection",
    (status) => {
      expect(connectionStatusForChannel(status)).toBe("reconnecting");
    },
  );

  it("leaves unrecognized transition events unchanged", () => {
    expect(connectionStatusForChannel("JOINING")).toBeNull();
  });
});
