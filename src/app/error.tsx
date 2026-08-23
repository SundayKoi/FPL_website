"use client";

import { useEffect } from "react";
import { RouteErrorState } from "@/components/system/RouteState";

export default function ErrorPage({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return <RouteErrorState onRetry={retry} />;
}
