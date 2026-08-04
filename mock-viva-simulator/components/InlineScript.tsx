// Renders an inline <script> that runs synchronously during HTML parsing
// (before hydration), without tripping React 19's dev warning about script
// tags in the render tree. The trick (per Next.js' "Preventing Flash Before
// Hydration" guide): emit a real executable script on the server, but mark it
// `text/plain` on the client so React's reconciler skips it. The type mismatch
// is harmless and silenced with suppressHydrationWarning.
export function InlineScript({ html }: { html: string }) {
  return (
    <script
      type={typeof window === "undefined" ? "text/javascript" : "text/plain"}
      suppressHydrationWarning
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
