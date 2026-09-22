import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "RankLocal — SEO Local & AI Search Visibility",
  description:
    "Descubra como sua empresa aparece no Google, compare seus concorrentes e aumente sua visibilidade local e em buscas com IA.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="pt-BR" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
