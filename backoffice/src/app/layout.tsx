import type { Metadata } from "next";
import "./globals.css";
import { Toaster } from "sonner";

export const metadata: Metadata = {
  title: "Tara | Backoffice",
  description: "Operação e administração da Plataforma Tara",
  icons: {
    icon: "/icon.png"
  }
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <body suppressHydrationWarning>{children}<Toaster position="top-right" richColors closeButton /></body>
    </html>
  );
}
