"use client";

import { useActionState, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Search, Loader2, CheckCircle2, PlugZap } from "lucide-react";
import {
  searchPlacesAction,
  confirmPlaceAction,
  type PlacesSearchState,
} from "@/lib/actions/places";
import { createBusinessAction, type CreateBusinessState } from "@/lib/actions/businesses";
import type { NormalizedPlace } from "@/types/places";

/**
 * Fase 2: busca real no Google Places (Text Search), com confirmação
 * manual obrigatória do usuário — nunca seleciona automaticamente um
 * resultado, mesmo havendo apenas um candidato — e salvamento real da
 * empresa (via Server Action) ao final.
 */

const initialSearchState: PlacesSearchState = null;
const initialCreateState: CreateBusinessState = null;

type FormFields = {
  name: string;
  website: string;
  phone: string;
  address: string;
  category: string;
};

export function NewBusinessForm({ placesConfigured }: { placesConfigured: boolean }) {
  const [searchState, searchAction, isSearching] = useActionState(
    searchPlacesAction,
    initialSearchState
  );
  const [createState, createAction, isSaving] = useActionState(
    createBusinessAction,
    initialCreateState
  );
  const [isConfirming, startConfirmTransition] = useTransition();
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const [confirmedPlace, setConfirmedPlace] = useState<NormalizedPlace | null>(null);
  const [fields, setFields] = useState<FormFields>({
    name: "",
    website: "",
    phone: "",
    address: "",
    category: "",
  });

  function handleConfirm(place: NormalizedPlace) {
    setConfirmError(null);
    startConfirmTransition(async () => {
      const result = await confirmPlaceAction(place.placeId);
      if (!result.ok) {
        setConfirmError(result.error);
        return;
      }
      setConfirmedPlace(result.place);
      setFields({
        name: result.place.displayName,
        website: result.place.website ?? "",
        phone: result.place.phoneNumber ?? "",
        address: result.place.formattedAddress ?? "",
        category: result.place.primaryType ?? "",
      });
    });
  }

  function resetSelection() {
    setConfirmedPlace(null);
    setConfirmError(null);
  }

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardContent className="flex flex-col gap-3 p-5">
          <Label htmlFor="place-search">Buscar empresa no Google</Label>

          {!placesConfigured ? (
            <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3">
              <PlugZap className="mt-0.5 h-4 w-4 shrink-0 text-brand-amber" />
              <div>
                <p className="text-sm font-medium text-amber-800">Google Places não conectado</p>
                <p className="text-xs text-amber-700">
                  Configure <code>GOOGLE_PLACES_API_KEY</code> para habilitar a busca
                  automática. Por enquanto, cadastre os dados manualmente abaixo.
                </p>
              </div>
            </div>
          ) : (
            <>
              <form action={searchAction} className="flex gap-2">
                <div className="relative flex-1">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <Input
                    id="place-search"
                    name="query"
                    placeholder="Nome da empresa + cidade"
                    className="pl-9"
                    defaultValue={searchState?.query ?? ""}
                    disabled={isSearching}
                  />
                </div>
                <Button type="submit" variant="outline" disabled={isSearching}>
                  {isSearching ? <Loader2 className="h-4 w-4 animate-spin" /> : "Buscar"}
                </Button>
              </form>

              {searchState?.error && (
                <p className="text-sm text-brand-red" role="alert">{searchState.error}</p>
              )}

              {searchState?.results && searchState.results.length > 0 && !confirmedPlace && (
                <div className="mt-2 flex flex-col gap-2">
                  <p className="text-xs text-slate-400">
                    Selecione o estabelecimento correto. Nunca escolhemos automaticamente por você.
                  </p>
                  {searchState.results.map((place) => (
                    <button
                      key={place.placeId}
                      type="button"
                      onClick={() => handleConfirm(place)}
                      disabled={isConfirming}
                      className="flex flex-col items-start gap-0.5 rounded-lg border border-slate-200 p-3 text-left text-sm transition-colors hover:border-brand-blue hover:bg-blue-50 disabled:opacity-50"
                    >
                      <span className="font-medium text-slate-800">{place.displayName}</span>
                      <span className="text-xs text-slate-500">
                        {place.formattedAddress ?? "Endereço não informado"}
                      </span>
                    </button>
                  ))}
                </div>
              )}

              {confirmError && (
                <p className="text-sm text-brand-red" role="alert">{confirmError}</p>
              )}

              {confirmedPlace && (
                <div className="mt-2 flex items-start justify-between gap-3 rounded-lg border border-emerald-200 bg-emerald-50 p-3">
                  <div className="flex items-start gap-2">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-brand-emerald" />
                    <div>
                      <p className="text-sm font-medium text-slate-800">
                        {confirmedPlace.displayName}
                      </p>
                      <p className="text-xs text-slate-500">
                        Place ID: {confirmedPlace.placeId}
                      </p>
                    </div>
                  </div>
                  <Button type="button" variant="ghost" size="sm" onClick={resetSelection}>
                    Trocar
                  </Button>
                </div>
              )}

              <p className="text-xs text-slate-400">
                Os dados encontrados preenchem o formulário abaixo automaticamente.
                Revise e complete o que faltar antes de salvar.
              </p>
            </>
          )}
        </CardContent>
      </Card>

      <form action={createAction} className="flex flex-col gap-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5 sm:col-span-2">
            <Label htmlFor="name">Nome</Label>
            <Input
              id="name"
              name="name"
              required
              value={fields.name}
              onChange={(e) => setFields((f) => ({ ...f, name: e.target.value }))}
              placeholder="Nome da empresa"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="website">Site</Label>
            <Input
              id="website"
              name="website"
              type="url"
              value={fields.website}
              onChange={(e) => setFields((f) => ({ ...f, website: e.target.value }))}
              placeholder="https://"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="phone">Telefone</Label>
            <Input
              id="phone"
              name="phone"
              value={fields.phone}
              onChange={(e) => setFields((f) => ({ ...f, phone: e.target.value }))}
              placeholder="(00) 00000-0000"
            />
          </div>
          <div className="flex flex-col gap-1.5 sm:col-span-2">
            <Label htmlFor="address">Endereço</Label>
            <Input
              id="address"
              name="address"
              value={fields.address}
              onChange={(e) => setFields((f) => ({ ...f, address: e.target.value }))}
              placeholder="Rua, número, bairro"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="city">Cidade</Label>
            <Input id="city" name="city" required placeholder="Brasília" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="state">Estado</Label>
            <Input id="state" name="state" required placeholder="DF" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="country">País</Label>
            <Input id="country" name="country" defaultValue="Brasil" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="category">Categoria</Label>
            <Input
              id="category"
              name="category"
              value={fields.category}
              onChange={(e) => setFields((f) => ({ ...f, category: e.target.value }))}
              placeholder="Ex: Clínica odontológica"
            />
          </div>
          <div className="flex flex-col gap-1.5 sm:col-span-2">
            <Label htmlFor="keywords">Palavras-chave (separadas por vírgula)</Label>
            <Input id="keywords" name="keywords" placeholder="dentista em brasília, clareamento dental" />
          </div>
          <div className="flex flex-col gap-1.5 sm:col-span-2">
            <Label htmlFor="serviceArea">Área de atuação</Label>
            <Input id="serviceArea" name="serviceArea" placeholder="Brasília e região" />
          </div>
        </div>

        <input type="hidden" name="googlePlaceId" value={confirmedPlace?.placeId ?? ""} />
        <div className="flex items-center gap-2">
          <Badge variant={confirmedPlace ? "success" : "secondary"}>
            {confirmedPlace ? `Place ID vinculado: ${confirmedPlace.placeId}` : "Place ID: ainda não vinculado"}
          </Badge>
        </div>

        {createState?.error && (
          <p className="text-sm text-brand-red" role="alert">{createState.error}</p>
        )}

        <Button type="submit" className="mt-2 self-start" disabled={isSaving}>
          {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Salvar empresa"}
        </Button>
      </form>
    </div>
  );
}
