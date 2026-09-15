import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Partner Sequencer",
  description: "Account context, brand voice, and drafted outreach sequences in one place.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
