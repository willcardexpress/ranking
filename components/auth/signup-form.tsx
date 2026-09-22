"use client";

import { useActionState } from "react";
import Link from "next/link";
import { CheckCircle2 } from "lucide-react";
import { signUp, type SignUpActionState } from "@/lib/supabase/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const initialState: SignUpActionState = null;

export function SignUpForm() {
  const [state, formAction, isPending] = useActionState(signUp, initialState);

  if (state?.needsEmailConfirmation) {
    return (
      <div className="flex flex-col items-center gap-3 py-4 text-center">
        <CheckCircle2 className="h-8 w-8 text-brand-emerald" />
        <p className="text-sm font-medium text-slate-800">Confirme seu e-mail</p>
        <p className="text-sm text-slate-500">
          Enviamos um link de confirmação para o e-mail informado. Abra sua caixa de entrada e clique no
          link para ativar sua conta antes de entrar.
        </p>
        <Link href="/login" className="text-sm font-medium text-brand-blue hover:underline">
          Voltar para o login
        </Link>
      </div>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="organizationName">Nome da empresa/agência</Label>
        <Input
          id="organizationName"
          name="organizationName"
          required
          placeholder="Agência XYZ"
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="email">E-mail</Label>
        <Input id="email" name="email" type="email" required placeholder="voce@empresa.com" />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="password">Senha</Label>
        <Input id="password" name="password" type="password" required minLength={8} placeholder="Mínimo 8 caracteres" />
      </div>

      {state?.error && (
        <p className="text-sm text-brand-red" role="alert">{state.error}</p>
      )}

      <Button type="submit" className="mt-2" disabled={isPending}>
        {isPending ? "Criando conta..." : "Criar conta"}
      </Button>

      <p className="text-center text-sm text-slate-500">
        Já tem conta?{" "}
        <Link href="/login" className="font-medium text-brand-blue hover:underline">
          Entrar
        </Link>
      </p>
    </form>
  );
}
