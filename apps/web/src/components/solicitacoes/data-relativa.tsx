import { formatarData, formatarRelativo } from '@/features/solicitacoes/datas';
import { cn } from '@/lib/utils';

/** Data relativa ("há 2 dias") com a data completa no title e no dateTime. */
export function DataRelativa({
  iso,
  agora,
  className,
}: {
  iso: string;
  agora?: Date;
  className?: string;
}) {
  return (
    <time dateTime={iso} title={formatarData(iso)} className={cn('whitespace-nowrap', className)}>
      {formatarRelativo(iso, agora)}
    </time>
  );
}
