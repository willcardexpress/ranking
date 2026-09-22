"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";
import {
  listGoogleAccountsAction,
  listGoogleLocationsAction,
  selectGoogleLocationAction,
} from "@/lib/actions/google-business";
import type { GoogleBusinessAccount, GoogleBusinessLocation } from "@/types/google-business-profile";

type Step = "accounts" | "locations";

export function AccountLocationPicker({ businessId }: { businessId: string }) {
  const router = useRouter();
  const [step, setStep] = useState<Step>("accounts");
  const [accounts, setAccounts] = useState<GoogleBusinessAccount[] | null>(null);
  const [locations, setLocations] = useState<GoogleBusinessLocation[] | null>(null);
  const [selectedAccount, setSelectedAccount] = useState<GoogleBusinessAccount | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function loadAccounts() {
    setError(null);
    startTransition(async () => {
      const result = await listGoogleAccountsAction(businessId);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      if (result.accounts.length === 0) {
        setError("Nenhuma conta do Google Business Profile foi encontrada para este usuário.");
        return;
      }
      setAccounts(result.accounts);
    });
  }

  function chooseAccount(account: GoogleBusinessAccount) {
    setError(null);
    setSelectedAccount(account);
    startTransition(async () => {
      const result = await listGoogleLocationsAction(businessId, account.resourceName, account.accountName);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      if (result.locations.length === 0) {
        setError("Nenhum perfil (local) foi encontrado nesta conta.");
        return;
      }
      setLocations(result.locations);
      setStep("locations");
    });
  }

  function chooseLocation(location: GoogleBusinessLocation) {
    setError(null);
    startTransition(async () => {
      const result = await selectGoogleLocationAction(businessId, location.resourceName);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  if (!accounts) {
    return (
      <div className="flex flex-col gap-3">
        <p className="text-sm text-slate-500">
          Conta autorizada com sucesso. Agora liste as contas do Google Business Profile disponíveis para
          continuar.
        </p>
        <Button size="sm" onClick={loadAccounts} disabled={isPending} className="self-start">
          {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Listar contas do Google"}
        </Button>
        {error && <p className="text-sm text-brand-red" role="alert">{error}</p>}
      </div>
    );
  }

  if (step === "accounts") {
    return (
      <div className="flex flex-col gap-2">
        <p className="text-xs text-slate-400">Selecione a conta correta:</p>
        {accounts.map((account) => (
          <button
            key={account.resourceName}
            type="button"
            onClick={() => chooseAccount(account)}
            disabled={isPending}
            className="flex flex-col items-start gap-0.5 rounded-lg border border-slate-200 p-3 text-left text-sm transition-colors hover:border-brand-blue hover:bg-blue-50 disabled:opacity-50"
          >
            <span className="font-medium text-slate-800">{account.accountName ?? account.resourceName}</span>
            <span className="text-xs text-slate-500">{account.type ?? "tipo não informado"}</span>
          </button>
        ))}
        {isPending && <Loader2 className="h-4 w-4 animate-spin text-slate-400" />}
        {error && <p className="text-sm text-brand-red" role="alert">{error}</p>}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs text-slate-400">
        Conta: <span className="font-medium text-slate-600">{selectedAccount?.accountName}</span> — selecione o
        perfil (local) correto:
      </p>
      {(locations ?? []).map((location) => (
        <button
          key={location.resourceName}
          type="button"
          onClick={() => chooseLocation(location)}
          disabled={isPending}
          className="flex flex-col items-start gap-0.5 rounded-lg border border-slate-200 p-3 text-left text-sm transition-colors hover:border-brand-blue hover:bg-blue-50 disabled:opacity-50"
        >
          <span className="font-medium text-slate-800">{location.title ?? location.resourceName}</span>
          <span className="text-xs text-slate-500">
            {location.address?.addressLines?.join(", ") || "endereço não informado"}
          </span>
        </button>
      ))}
      {isPending && <Loader2 className="h-4 w-4 animate-spin text-slate-400" />}
      {error && <p className="text-sm text-brand-red" role="alert">{error}</p>}
      <Button type="button" variant="ghost" size="sm" className="self-start" onClick={() => setStep("accounts")}>
        Trocar conta
      </Button>
    </div>
  );
}
