import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";

interface MetricCardProps {
  title: string;
  value: string;
  helperText?: string;
  progressValue?: number; // 0-100, exibido como barra quando presente
  accentClassName?: string;
}

export function MetricCard({
  title,
  value,
  helperText,
  progressValue,
  accentClassName,
}: MetricCardProps) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <p className={cn("text-2xl font-semibold text-slate-900", accentClassName)}>
          {value}
        </p>
        {typeof progressValue === "number" && (
          <Progress value={progressValue} className="mt-3" />
        )}
        {helperText && <p className="mt-2 text-xs text-slate-400">{helperText}</p>}
      </CardContent>
    </Card>
  );
}
