import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'PolyCalc (v0.1)',
  description: 'Price. Edge. EV. Kelly.',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
