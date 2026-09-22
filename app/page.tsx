import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function Home() {
  return (
    <div className="flex flex-1 flex-col">
      <header className="flex items-center justify-between border-b border-slate-200 bg-white px-6 py-4 sm:px-10">
        <span className="text-lg font-semibold tracking-tight text-slate-900">
          Rank<span className="text-brand-blue">Local</span>
        </span>
        <nav className="flex items-center gap-3">
          <Link href="/login">
            <Button variant="ghost" size="sm">Entrar</Button>
          </Link>
          <Link href="/cadastro">
            <Button size="sm">Criar conta</Button>
          </Link>
        </nav>
      </header>

      <main className="flex flex-1 items-center justify-center px-6 py-20 sm:px-10">
        <div className="max-w-2xl text-center">
          <h1 className="text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl">
            Descubra como sua empresa aparece no Google
          </h1>
          <p className="mt-4 text-lg leading-relaxed text-slate-600">
            Compare seus concorrentes e descubra o que precisa melhorar para
            aumentar sua presença local e sua visibilidade nas buscas com IA.
          </p>
          <div className="mt-8 flex items-center justify-center gap-3">
            <Link href="/cadastro">
              <Button size="lg">Começar agora</Button>
            </Link>
            <Link href="/login">
              <Button variant="outline" size="lg">Já tenho conta</Button>
            </Link>
          </div>
          <p className="mt-6 text-xs text-slate-400">
            Google Places, Ranking Local, Google Business Profile e Auditoria de SEO já estão disponíveis.
            AI Visibility e Consultor IA chegam nas próximas fases.
          </p>
        </div>
      </main>
    </div>
  );
}
