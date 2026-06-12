import type { Metadata } from "next";
import { Press_Start_2P } from "next/font/google";
import "./globals.css";

const pixelFont = Press_Start_2P({
  weight: "400",
  subsets: ["latin"],
  variable: "--font-pixel",
});

export const metadata: Metadata = {
  title: "AcadéMon AI — Gotta Pass 'Em All",
  description:
    "A pixel-style academic adventure: an A* agent autopilots the hero, you fight or retreat. Group 2, Intro to AI.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={pixelFont.variable}>{children}</body>
    </html>
  );
}
