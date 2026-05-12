import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "FineTune — LLM Fine-Tuning Platform",
  description: "Fine-tune open source LLMs with your data",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
