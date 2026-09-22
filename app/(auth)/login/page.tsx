import { LoginForm } from "@/components/auth/login-form";

export default function LoginPage() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Entrar</h1>
        <p className="text-sm text-slate-500">Acesse o painel do RankLocal.</p>
      </div>
      <LoginForm />
    </div>
  );
}
