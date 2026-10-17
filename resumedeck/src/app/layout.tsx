import type { Metadata } from "next";
import { Montserrat, Source_Code_Pro, Source_Sans_3 } from "next/font/google";
import { DeckProvider } from "@/lib/deck-store";
import "./globals.css";

const montserrat = Montserrat({ subsets: ["latin"], weight: ["700", "800"], variable: "--font-montserrat" });
const sourceSans = Source_Sans_3({ subsets: ["latin"], weight: ["400", "600", "700"], variable: "--font-source-sans" });
const sourceCode = Source_Code_Pro({ subsets: ["latin"], weight: ["400", "500"], variable: "--font-source-code" });

export const metadata: Metadata = {
  title: "clicked",
  description: "Resume decks for recruiters",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${montserrat.variable} ${sourceSans.variable} ${sourceCode.variable}`}>
      <body>
        <DeckProvider>{children}</DeckProvider>
      </body>
    </html>
  );
}
