"use client";
import { useEffect, useState } from "react";
import { remainingMs } from "@/lib/time";

export function useCountdown(closesAt: string | null, offsetMs: number) {
  const [ms, setMs] = useState(() => (closesAt ? remainingMs(closesAt, offsetMs) : 0));
  const [prevKey, setPrevKey] = useState(closesAt);

  if (closesAt !== prevKey) {
    setPrevKey(closesAt);
    setMs(closesAt ? remainingMs(closesAt, offsetMs) : 0);
  }

  useEffect(() => {
    if (!closesAt) return;
    const id = setInterval(() => setMs(remainingMs(closesAt, offsetMs)), 250);
    return () => clearInterval(id);
  }, [closesAt, offsetMs]);

  return {
    secondsLeft: Math.ceil(ms / 1000),
    expired: closesAt !== null && ms <= 0,
  };
}
