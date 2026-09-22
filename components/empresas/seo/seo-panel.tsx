import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { SeoClientPanel } from "./seo-client-panel";
import { getWebsiteProject, getLatestSeoAudit } from "@/lib/seo-data";

export async function SeoPanel({ businessId }: { businessId: string }) {
  const [{ project, isDemo: projectDemo }, { summary, isDemo: summaryDemo }] = await Promise.all([
    getWebsiteProject(businessId),
    getLatestSeoAudit(businessId),
  ]);

  const isDemo = projectDemo || summaryDemo;

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <CardTitle>Auditoria de SEO</CardTitle>
        {isDemo && <Badge variant="demo">DEMO</Badge>}
      </CardHeader>
      <CardContent>
        <SeoClientPanel businessId={businessId} project={project} summary={summary} />
      </CardContent>
    </Card>
  );
}
