import { SignUpForm } from "@/components/auth/signup-form";

export default function SignUpPage() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Criar conta</h1>
        <p className="text-sm text-slate-500">
          Comece a monitorar sua presença local e visibilidade em buscas com IA.
        </p>
      </div>
      <SignUpForm />
    </div>
  );
}
