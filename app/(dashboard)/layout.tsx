import { Sidebar } from "@/components/layout/sidebar";
import { Topbar } from "@/components/layout/topbar";
import { createClient } from "@/lib/supabase/server";

async function getCurrentUserEmail(): Promise<string | null> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    return user?.email ?? null;
  } catch {
    // Supabase ainda não configurado neste ambiente (sem envs) — modo demo.
    return null;
  }
}

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const userEmail = await getCurrentUserEmail();

  return (
    <div className="flex min-h-screen flex-1 bg-slate-50">
      <Sidebar />
      <div className="flex flex-1 flex-col">
        <Topbar userEmail={userEmail} />
        <main className="flex-1 px-6 py-6 sm:px-8">{children}</main>
      </div>
    </div>
  );
}
