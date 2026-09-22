import { NewBusinessForm } from "@/components/empresas/new-business-form";
import { checkGooglePlacesConfigured } from "@/lib/actions/places";

export default async function NovaEmpresaPage() {
  const placesConfigured = await checkGooglePlacesConfigured();

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Adicionar empresa</h1>
        <p className="text-sm text-slate-500">
          Cadastre os dados da empresa para começar o monitoramento.
        </p>
      </div>
      <NewBusinessForm placesConfigured={placesConfigured} />
    </div>
  );
}
