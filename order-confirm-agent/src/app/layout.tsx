import type { Metadata } from "next";

import "./globals.css";

export const metadata: Metadata = {
  title: "Order Confirmation Agent",
  description:
    "A COD confirmation agentic call simulator — real STT, real Claude, real TTS.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
