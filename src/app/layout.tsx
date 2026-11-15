import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Riale RH", template: "%s · Riale RH" },
  description: "Plataforma interna de Recursos Humanos — Riale Hotéis",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = { themeColor: "#2b1d14", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR" className="h-full antialiased">
      <body className="min-h-full">{children}</body>
    </html>
  );
}
