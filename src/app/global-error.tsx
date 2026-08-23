"use client";

import { useEffect } from "react";

const buttonStyle = {
  border: "1px solid #ff8066",
  borderRadius: "999px",
  color: "#00121f",
  background: "#ff8066",
  cursor: "pointer",
  fontSize: "0.75rem",
  fontWeight: 700,
  letterSpacing: "0.08em",
  padding: "0.65rem 1rem",
  textTransform: "uppercase" as const,
};

export default function GlobalError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          alignItems: "center",
          background: "#00121f",
          color: "white",
          display: "flex",
          fontFamily: "system-ui, sans-serif",
          justifyContent: "center",
          margin: 0,
          minHeight: "100vh",
          padding: "1.5rem",
          textAlign: "center",
        }}
      >
        <main
          role="alert"
          style={{
            background: "#071d2c",
            border: "1px solid #244052",
            borderRadius: "0.75rem",
            maxWidth: "34rem",
            padding: "2rem",
            width: "100%",
          }}
        >
          <title>Something went wrong — FPL</title>
          <p style={{ color: "#ff9b87", fontSize: "0.75rem", fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase" }}>
            FPL temporarily unavailable
          </p>
          <h1 style={{ fontSize: "2rem", margin: "0.75rem 0" }}>Couldn&apos;t load the site</h1>
          <p style={{ color: "#9eb0bf", lineHeight: 1.6, margin: "0 auto 1.5rem" }}>
            The problem may be temporary. Try loading the site again.
          </p>
          <button type="button" onClick={retry} style={buttonStyle}>
            Try again
          </button>
        </main>
      </body>
    </html>
  );
}
