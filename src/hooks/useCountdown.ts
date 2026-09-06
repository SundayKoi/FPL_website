"use client";
import { useEffect, useState } from "react";
import { remainingMs } from "@/lib/time";

export function useCountdown(closesAt: string | null, offsetMs: number) {
  const secondsRemaining = () => closesAt ? Math.ceil(remainingMs(closesAt, offsetMs) / 1000) : 0;
  const [secondsLeft, setSecondsLeft] = useState(secondsRemaining);
  const [previous, setPrevious] = useState({ closesAt, offsetMs });

  if (closesAt !== previous.closesAt || offsetMs !== previous.offsetMs) {
    setPrevious({ closesAt, offsetMs });
    setSecondsLeft(secondsRemaining());
  }

  useEffect(() => {
    if (!closesAt || remainingMs(closesAt, offsetMs) <= 0) return;
    const id = setInterval(() => {
      const seconds = Math.ceil(remainingMs(closesAt, offsetMs) / 1000);
      setSecondsLeft(seconds);
      if (seconds <= 0) clearInterval(id);
    }, 250);
    return () => clearInterval(id);
  }, [closesAt, offsetMs]);

  return { secondsLeft, expired: closesAt !== null && secondsLeft <= 0 };
}
