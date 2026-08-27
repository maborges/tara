import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Tara | AgroSaaS",
  description: "Terminal de operação de pesagem offline-first",
  manifest: "/manifest.json",
  icons: {
    icon: "/icon.png",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      {/* suppressHydrationWarning: extensões de navegador (ex.: ColorZilla) injetam
          atributos no <body> antes do React hidratar — não é um bug da aplicação. */}
      <body suppressHydrationWarning>{children}</body>
    </html>
  );
}
