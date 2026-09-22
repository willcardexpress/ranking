"use server";

import { z } from "zod";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

const credentialsSchema = z.object({
  email: z.string().email("Informe um e-mail válido."),
  password: z.string().min(8, "A senha deve ter ao menos 8 caracteres."),
});

export type AuthActionState = {
  error?: string;
} | null;

export async function signIn(
  _prevState: AuthActionState,
  formData: FormData
): Promise<AuthActionState> {
  const parsed = credentialsSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);

  if (error) {
    return { error: "E-mail ou senha incorretos." };
  }

  redirect("/dashboard");
}

const signUpSchema = credentialsSchema.extend({
  organizationName: z.string().min(2, "Informe o nome da sua empresa ou agência."),
});

export type SignUpActionState = {
  error?: string;
  /** true = conta criada, mas precisa confirmar o e-mail antes de logar. */
  needsEmailConfirmation?: boolean;
} | null;

export async function signUp(
  _prevState: SignUpActionState,
  formData: FormData
): Promise<SignUpActionState> {
  const parsed = signUpSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
    organizationName: formData.get("organizationName"),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      data: { organization_name: parsed.data.organizationName },
    },
  });

  if (error) {
    return { error: "Não foi possível criar a conta. Tente novamente." };
  }

  // A criação da organização e do vínculo em organization_members acontece
  // de forma preguiçosa, no primeiro cadastro de empresa (ver
  // lib/organizations.ts — ensureOrganizationForUser), não aqui.
  //
  // supabase.auth.signUp() só retorna uma sessão ativa se a confirmação
  // de e-mail estiver desativada no projeto Supabase. Com confirmação
  // ativada (padrão em projetos novos), `data.session` vem nulo — nesse
  // caso não faz sentido redirecionar para /dashboard (o middleware
  // mandaria de volta para /login sem explicação nenhuma). Em vez disso,
  // avisamos o usuário para confirmar o e-mail.
  if (!data.session) {
    return { needsEmailConfirmation: true };
  }

  redirect("/dashboard");
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
