export type LiveConnectionStatus = "connecting" | "connected" | "reconnecting";

export function connectionStatusForChannel(status: string): LiveConnectionStatus | null {
  if (status === "SUBSCRIBED") return "connected";
  if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
    return "reconnecting";
  }
  return null;
}
