import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DemoBanner } from "@/components/dashboard/demo-banner";
import { getBusinessesForCurrentUser } from "@/lib/businesses-data";

export default async function EmpresasPage() {
  const { businesses, isDemo } = await getBusinessesForCurrentUser();

  return (
    <div className="flex flex-col gap-6">
      {isDemo && <DemoBanner />}

      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-slate-900">Empresas</h1>
        <Link href="/empresas/nova">
          <Button size="sm">Adicionar empresa</Button>
        </Link>
      </div>

      {businesses.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
            <p className="text-sm text-slate-500">
              Nenhuma empresa cadastrada ainda.
            </p>
            <Link href="/empresas/nova">
              <Button size="sm">Adicionar primeira empresa</Button>
            </Link>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {businesses.map((business) => (
            <Link key={business.id} href={`/empresas/${business.id}`}>
              <Card className="h-full transition-shadow hover:shadow-md">
                <CardContent className="flex flex-col gap-2 p-5">
                  <div className="flex items-center justify-between">
                    <h2 className="font-medium text-slate-900">{business.name}</h2>
                    {business.is_demo && <Badge variant="demo">DEMO</Badge>}
                    {!business.is_demo && business.google_place_id && (
                      <Badge variant="success">Google vinculado</Badge>
                    )}
                  </div>
                  <p className="text-sm text-slate-500">{business.service_area}</p>
                  <p className="text-xs text-slate-400">{business.category}</p>
                  <div className="mt-2 flex flex-wrap gap-1">
                    {business.keywords.slice(0, 3).map((kw) => (
                      <Badge key={kw} variant="secondary">{kw}</Badge>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
