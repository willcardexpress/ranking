import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PlugZap } from "lucide-react";
import { GbpStatusPanel } from "./gbp-status-panel";
import {
  checkGoogleBusinessProfileConfigured,
  getGoogleBusinessConnectionAction,
  getGoogleBusinessAuthUrlAction,
  getSyncedProfileDataAction,
} from "@/lib/actions/google-business";

export async function GoogleBusinessPanel({ businessId }: { businessId: string }) {
  const configured = await checkGoogleBusinessProfileConfigured();

  if (!configured) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Google Business Profile</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3">
            <PlugZap className="mt-0.5 h-4 w-4 shrink-0 text-brand-amber" />
            <div>
              <p className="text-sm font-medium text-amber-800">Google Business Profile não conectado</p>
              <p className="text-xs text-amber-700">
                Configure <code>GOOGLE_CLIENT_ID</code>, <code>GOOGLE_CLIENT_SECRET</code> e{" "}
                <code>GOOGLE_OAUTH_REDIRECT_URI</code> para habilitar esta integração. Mesmo configurado, a Google
                exige aprovação manual do projeto (&quot;Basic API Access&quot;) antes das chamadas funcionarem — ver
                docs/google-business-profile.md.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  const summary = await getGoogleBusinessConnectionAction(businessId);

  if (!summary) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Google Business Profile</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-slate-500">Não foi possível carregar o status da conexão.</p>
        </CardContent>
      </Card>
    );
  }

  const [authUrlResult, profileData] = await Promise.all([
    getGoogleBusinessAuthUrlAction(businessId),
    getSyncedProfileDataAction(businessId),
  ]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Google Business Profile</CardTitle>
      </CardHeader>
      <CardContent>
        <GbpStatusPanel
          businessId={businessId}
          summary={summary}
          profileData={profileData}
          authUrl={authUrlResult.ok ? authUrlResult.url : null}
        />
      </CardContent>
    </Card>
  );
}
