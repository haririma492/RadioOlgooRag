import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Reza Pahlavi Video Search",
  description: "Search English interviews and speeches by Reza Pahlavi"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
