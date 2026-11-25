import type { Metadata, Viewport } from "next";
import { Bricolage_Grotesque } from "next/font/google";
import "./globals.css";

const font = Bricolage_Grotesque({ subsets: ["latin"], variable: "--font", display: "swap" });

export const metadata: Metadata = {
  title: "¿Quién es quién?",
  description: "Juego en vivo para el equipo: cada uno manda un dato curioso y todos adivinan de quién es.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#1b1035",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" className={font.variable}>
      <body>{children}</body>
    </html>
  );
}
