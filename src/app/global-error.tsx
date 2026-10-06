"use client"

export default function GlobalError({
  error,
  retry,
}: {
  error: Error & { digest?: string }
  retry: () => void
}) {
  return (
    <html lang="en">
      <body
        style={{
          fontFamily: "system-ui, sans-serif",
          padding: "4rem 1.5rem",
          maxWidth: 560,
          margin: "0 auto",
        }}
      >
        <h1 style={{ fontSize: 18 }}>Something went wrong</h1>
        <p style={{ color: "#555", fontSize: 14 }}>
          The application failed to load. Nothing was changed.
        </p>
        {error.digest ? (
          <p style={{ fontFamily: "monospace", fontSize: 12, color: "#777" }}>
            Reference: {error.digest}
          </p>
        ) : null}
        <button
          type="button"
          onClick={() => retry()}
          style={{ marginTop: 12, padding: "6px 12px" }}
        >
          Try again
        </button>
      </body>
    </html>
  )
}
