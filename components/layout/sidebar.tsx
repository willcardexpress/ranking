"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard,
  Building2,
  MapPin,
  Sparkles,
  FileText,
  MessageCircle,
  FileBarChart,
  Plug,
  Settings,
} from "lucide-react";

interface NavItem {
  label: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  disabled?: boolean; // módulos ainda não implementados (fases futuras)
}

const navItems: NavItem[] = [
  { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { label: "Empresas", href: "/empresas", icon: Building2 },
  { label: "Google Maps", href: "/google-maps", icon: MapPin },
  { label: "AI Visibility", href: "/ai-visibility", icon: Sparkles, disabled: true },
  { label: "Conteúdo", href: "/conteudo", icon: FileText, disabled: true },
  { label: "Consultor IA", href: "/consultor-ia", icon: MessageCircle, disabled: true },
  { label: "Relatórios", href: "/relatorios", icon: FileBarChart, disabled: true },
  { label: "Integrações", href: "/integracoes", icon: Plug, disabled: true },
  { label: "Configurações", href: "/configuracoes", icon: Settings, disabled: true },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="hidden w-64 shrink-0 flex-col border-r border-slate-200 bg-white px-4 py-6 sm:flex">
      <Link href="/dashboard" className="mb-8 px-2 text-lg font-semibold tracking-tight text-slate-900">
        Rank<span className="text-brand-blue">Local</span>
      </Link>
      <nav className="flex flex-1 flex-col gap-1">
        {navItems.map((item) => {
          const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`);
          const Icon = item.icon;

          if (item.disabled) {
            return (
              <span
                key={item.href}
                className="flex cursor-not-allowed items-center gap-3 rounded-lg px-3 py-2 text-sm text-slate-300"
                title="Disponível em uma próxima fase"
              >
                <Icon className="h-4 w-4" />
                {item.label}
              </span>
            );
          }

          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                isActive
                  ? "bg-blue-50 text-brand-blue"
                  : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
              )}
            >
              <Icon className="h-4 w-4" />
              {item.label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
