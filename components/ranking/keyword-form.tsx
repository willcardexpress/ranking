"use client";

import { useActionState, useRef, useEffect } from "react";
import { createKeywordAction, type ActionState } from "@/lib/actions/ranking";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const initialState: ActionState = null;

export function KeywordForm({ businessId }: { businessId: string }) {
  const [state, formAction, isPending] = useActionState(createKeywordAction, initialState);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state?.success) formRef.current?.reset();
  }, [state?.success]);

  return (
    <form ref={formRef} action={formAction} className="flex flex-col gap-2 sm:flex-row sm:items-start">
      <input type="hidden" name="businessId" value={businessId} />
      <div className="flex-1">
        <Input name="term" placeholder="Ex: troca de bateria em Taguatinga" required minLength={3} />
        {state?.error && <p className="mt-1 text-xs text-brand-red">{state.error}</p>}
      </div>
      <Button type="submit" variant="outline" size="sm" disabled={isPending}>
        {isPending ? "Salvando..." : "Adicionar palavra-chave"}
      </Button>
    </form>
  );
}
