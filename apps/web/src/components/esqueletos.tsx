import { Skeleton } from '@/components/ui/skeleton';

/** Esqueletos de carregamento no formato de cada tela (loading.tsx). */
export function EsqueletoDashboard() {
  return (
    <div role="status" aria-label="Carregando o dashboard" className="flex flex-col gap-4">
      <div className="flex justify-end">
        <Skeleton className="rounded-pill h-10 w-44" />
      </div>
      <div className="flex flex-wrap gap-4 max-[760px]:gap-3">
        <Skeleton className="rounded-card h-[300px] min-w-0 flex-[5_1_340px]" />
        <div className="grid min-w-0 flex-[7_1_420px] grid-cols-2 gap-4 max-[760px]:gap-3">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="bg-tile rounded-card flex flex-col gap-4 p-5">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-10 w-16" />
              <Skeleton className="h-1 w-full" />
            </div>
          ))}
        </div>
      </div>
      <div className="flex flex-wrap gap-4 max-[760px]:gap-3">
        <div className="bg-card rounded-card flex min-w-0 flex-[7_1_480px] flex-col gap-3 p-5">
          <Skeleton className="h-5 w-48" />
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="rounded-row h-11 w-full" />
          ))}
        </div>
        <div className="bg-card rounded-card flex min-w-0 flex-[5_1_320px] flex-col gap-3 p-5">
          <Skeleton className="h-5 w-32" />
          <Skeleton className="rounded-inner h-56 w-full" />
        </div>
      </div>
    </div>
  );
}

export function EsqueletoLista() {
  return (
    <div role="status" aria-label="Carregando as solicitações" className="flex flex-col gap-4">
      <div className="flex items-end justify-between gap-3 px-1">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="rounded-pill h-10 w-44" />
      </div>
      <div className="bg-card rounded-card flex flex-col gap-4 p-5">
        <Skeleton className="h-[42px] w-full" />
        <div className="flex flex-wrap gap-1.5">
          {[0, 1, 2, 3, 4, 5, 6].map((i) => (
            <Skeleton key={i} className="rounded-pill h-8 w-24" />
          ))}
        </div>
      </div>
      <div className="bg-card rounded-card flex flex-col gap-2 p-4">
        {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
          <Skeleton key={i} className="rounded-row h-11 w-full" />
        ))}
      </div>
    </div>
  );
}

export function EsqueletoDetalhe() {
  return (
    <div role="status" aria-label="Carregando a solicitação" className="flex flex-col gap-4">
      <Skeleton className="h-5 w-48" />
      <div className="bg-card rounded-card flex flex-col gap-3 p-6">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-8 w-2/3" />
        <Skeleton className="rounded-pill h-6 w-40" />
      </div>
      <div className="flex flex-wrap gap-4">
        <div className="bg-card rounded-card flex min-w-0 flex-[999_1_480px] flex-col gap-3 p-5">
          <Skeleton className="h-5 w-32" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-5/6" />
          <Skeleton className="h-28 w-full" />
        </div>
        <div className="bg-card rounded-card flex min-w-0 flex-[1_1_320px] flex-col gap-3 p-5">
          <Skeleton className="h-5 w-24" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      </div>
    </div>
  );
}
