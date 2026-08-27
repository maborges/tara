import type { Metadata } from "next";
import "./tailwind.css";
import "./globals.css";
import { Toaster } from "sonner";

export const metadata: Metadata = {
  title: "Tara | Portal do Cliente",
  description: "Administre sua integração com a Plataforma Tara",
  icons: {
    icon: "/icon.png",
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <body suppressHydrationWarning>{children}<Toaster position="top-right" richColors closeButton /></body>
    </html>
  );
}
