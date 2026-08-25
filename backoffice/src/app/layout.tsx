import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Tara | Backoffice",
  description: "Operação e administração da Plataforma Tara",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <body suppressHydrationWarning>{children}</body>
    </html>
  );
}
