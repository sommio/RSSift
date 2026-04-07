import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Strict monorepo template',
  description: 'Minimal Next.js and NestJS monorepo baseline.',
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
