"use client";

import { useActionState, useRef, useEffect } from "react";
import { createKeywordLocationAction, type ActionState } from "@/lib/actions/ranking";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const initialState: ActionState = null;

export function LocationForm({ keywordId }: { keywordId: string }) {
  const [state, formAction, isPending] = useActionState(createKeywordLocationAction, initialState);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state?.success) formRef.current?.reset();
  }, [state?.success]);

  return (
    <form ref={formRef} action={formAction} className="grid grid-cols-1 gap-2 sm:grid-cols-4">
      <input type="hidden" name="keywordId" value={keywordId} />
      <div className="sm:col-span-2">
        <Label htmlFor="label" className="sr-only">Nome do ponto</Label>
        <Input id="label" name="label" placeholder="Ex: Sede — Taguatinga" required />
      </div>
      <Input name="latitude" placeholder="Latitude" required type="number" step="any" />
      <div className="flex gap-2">
        <Input name="longitude" placeholder="Longitude" required type="number" step="any" />
        <Button type="submit" variant="outline" size="sm" disabled={isPending}>
          {isPending ? "..." : "Add"}
        </Button>
      </div>
      {state?.error && <p className="sm:col-span-4 text-xs text-brand-red">{state.error}</p>}
    </form>
  );
}
