import { signOut } from "@/lib/supabase/actions";
import { Button } from "@/components/ui/button";

export function Topbar({ userEmail }: { userEmail?: string | null }) {
  return (
    <header className="flex items-center justify-between border-b border-slate-200 bg-white px-6 py-3">
      <div />
      <div className="flex items-center gap-3">
        {userEmail && <span className="text-sm text-slate-500">{userEmail}</span>}
        <form action={signOut}>
          <Button type="submit" variant="ghost" size="sm">
            Sair
          </Button>
        </form>
      </div>
    </header>
  );
}
