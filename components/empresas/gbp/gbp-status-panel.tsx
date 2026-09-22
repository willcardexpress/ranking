"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Loader2, RefreshCw, Unplug } from "lucide-react";
import { AccountLocationPicker } from "./account-location-picker";
import {
  syncGoogleBusinessProfileAction,
  disconnectGoogleBusinessProfileAction,
} from "@/lib/actions/google-business";
import type { GoogleBusinessConnectionSummary } from "@/types/google-business-profile";
import type { SyncedProfileData } from "@/lib/actions/google-business";

const STATUS_LABEL: Record<GoogleBusinessConnectionSummary["status"], { label: string; dot: string }> = {
  not_connected: { label: "Não conectado", dot: "bg-slate-300" },
  connected: { label: "Conectado", dot: "bg-brand-emerald" },
  expired: { label: "Token expirado", dot: "bg-brand-amber" },
  revoked: { label: "Autorização revogada", dot: "bg-brand-red" },
  error: { label: "Erro de conexão", dot: "bg-brand-red" },
};

interface GbpStatusPanelProps {
  businessId: string;
  summary: GoogleBusinessConnectionSummary;
  profileData: SyncedProfileData | null;
  authUrl: string | null;
}

export function GbpStatusPanel({ businessId, summary, profileData, authUrl }: GbpStatusPanelProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const status = STATUS_LABEL[summary.status];
  const needsLocationSelection =
    summary.status !== "not_connected" && (!summary.googleAccountResourceName || !summary.selectedLocationResourceName);

  function handleSync() {
    setError(null);
    startTransition(async () => {
      const result = await syncGoogleBusinessProfileAction(businessId);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  function handleDisconnect() {
    setError(null);
    startTransition(async () => {
      await disconnectGoogleBusinessProfileAction(businessId);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className={`h-2.5 w-2.5 rounded-full ${status.dot}`} />
          <span className="text-sm font-medium text-slate-800">{status.label}</span>
          {summary.lastSyncedAt && (
            <span className="text-xs text-slate-400">
              · Última sincronização: {new Date(summary.lastSyncedAt).toLocaleString("pt-BR")}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {summary.status !== "not_connected" && !needsLocationSelection && (
            <Button size="sm" variant="outline" onClick={handleSync} disabled={isPending}>
              {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              Sincronizar agora
            </Button>
          )}
          {summary.status !== "not_connected" && (
            <Button size="sm" variant="ghost" onClick={handleDisconnect} disabled={isPending}>
              <Unplug className="h-4 w-4" />
              Desconectar
            </Button>
          )}
        </div>
      </div>

      {summary.lastError && (
        <p className="text-sm text-brand-red" role="alert">
          {summary.lastError}
        </p>
      )}
      {error && (
        <p className="text-sm text-brand-red" role="alert">
          {error}
        </p>
      )}

      {summary.status === "not_connected" && (
        <div className="flex flex-col gap-2">
          <p className="text-sm text-slate-500">
            Conecte seu Google Business Profile para importar os dados reais do perfil.
          </p>
          {authUrl ? (
            <a href={authUrl}>
              <Button size="sm">Conectar Google Business Profile</Button>
            </a>
          ) : (
            <p className="text-xs text-slate-400">Não foi possível gerar o link de autorização agora.</p>
          )}
        </div>
      )}

      {(summary.status === "revoked" || summary.status === "expired" || summary.status === "error") && authUrl && (
        <a href={authUrl}>
          <Button size="sm" variant="outline">Reconectar</Button>
        </a>
      )}

      {needsLocationSelection && summary.status !== "not_connected" && (
        <AccountLocationPicker businessId={businessId} />
      )}

      {summary.googleAccountName && (
        <p className="text-xs text-slate-400">
          Conta Google: {summary.googleAccountName}
          {summary.selectedLocationResourceName && ` · Perfil vinculado: ${summary.selectedLocationResourceName}`}
        </p>
      )}

      {profileData ? (
        <div className="grid grid-cols-1 gap-x-6 gap-y-1 rounded-lg border border-slate-100 bg-slate-50 p-4 text-sm sm:grid-cols-2">
          <Field label="Nome" value={profileData.title} />
          <Field label="Categoria principal" value={profileData.primaryCategory} />
          <Field
            label="Categorias adicionais"
            value={profileData.additionalCategories.length ? profileData.additionalCategories.join(", ") : null}
          />
          <Field label="Telefone" value={profileData.phoneNumbers[0] ?? null} />
          <Field label="Site" value={profileData.websiteUri} />
          <Field
            label="Endereço"
            value={
              profileData.addressLines.length
                ? [...profileData.addressLines, profileData.locality, profileData.administrativeArea]
                    .filter(Boolean)
                    .join(", ")
                : null
            }
          />
          <Field label="Descrição" value={profileData.description} />
          <Field
            label="Serviços"
            value={profileData.serviceItems.length ? profileData.serviceItems.join(", ") : null}
          />
          <Field label="Link no Google Maps" value={profileData.mapsUri} isLink />
          <Field label="Página para avaliações" value={profileData.newReviewUri} isLink />
          <Field label="Place ID" value={profileData.placeId} />
        </div>
      ) : (
        summary.status !== "not_connected" &&
        !needsLocationSelection && (
          <p className="text-sm text-slate-500">Ainda não sincronizado. Clique em &quot;Sincronizar agora&quot;.</p>
        )
      )}
    </div>
  );
}

function Field({ label, value, isLink }: { label: string; value: string | null; isLink?: boolean }) {
  return (
    <p className="flex flex-col">
      <span className="text-xs text-slate-400">{label}</span>
      {value ? (
        isLink ? (
          <a href={value} target="_blank" rel="noreferrer" className="truncate text-brand-blue hover:underline">
            {value}
          </a>
        ) : (
          <span className="text-slate-700">{value}</span>
        )
      ) : (
        <span className="text-slate-300">não disponível</span>
      )}
    </p>
  );
}
