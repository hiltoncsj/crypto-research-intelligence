import type { ReactNode } from "react";
import "./globals.css";

export const metadata = {
  title: "Crypto Research Intelligence",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
