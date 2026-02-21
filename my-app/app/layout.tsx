import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Resume ATS",
  description: "Basic multi-user resume ATS",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
