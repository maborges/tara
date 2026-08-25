import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Balança | Backoffice",
  description: "Operação e administração da Plataforma Balança",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <body suppressHydrationWarning>{children}</body>
    </html>
  );
}
