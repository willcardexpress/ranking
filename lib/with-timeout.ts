/**
 * Corre `promise` com um limite de tempo. Se o limite for excedido,
 * rejeita com `TimeoutError` em vez de deixar a operação pendurada
 * indefinidamente — usado para dar um teto de execução a scans de
 * ranking e auditorias de SEO dentro de uma Server Action síncrona.
 *
 * Importante: isto só protege contra a operação "internamente" demorar
 * demais (ex.: muitas chamadas de rede em sequência). Não protege contra
 * a própria função serverless ser encerrada à força pela plataforma
 * (Vercel etc.) antes desse timeout — nesse caso mais extremo, o registro
 * pode mesmo assim ficar "running"; é por isso que os pontos de leitura
 * (lib/seo-data.ts, lib/ranking-data.ts) também detectam e tratam
 * execuções obsoletas ("stale") na próxima tentativa, e um índice único
 * parcial no banco impede acumular execuções simultâneas para o mesmo
 * alvo. Uma fila/job em background (Fase 9) eliminaria esse limite por
 * completo.
 */
export class TimeoutError extends Error {
  constructor(message = "Tempo máximo excedido.") {
    super(message);
    this.name = "TimeoutError";
  }
}

export async function runWithTimeout<T>(promise: Promise<T>, timeoutMs: number, message?: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new TimeoutError(message)), timeoutMs);
  });

  try {
    return await Promise.race([promise, timeout]);
  } finally {
    clearTimeout(timer!);
  }
}
