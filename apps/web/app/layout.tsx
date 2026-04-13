import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Reader shell | First vertical slice",
  description:
    "A two-pane reader powered by the first fixture-backed article API slice.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
