import { cn } from '@/lib/utils';

/** Logo: quadrado laranja com a marca marinho e, opcionalmente, o nome do sistema. */
export function Marca({ comNome = true, className }: { comNome?: boolean; className?: string }) {
  return (
    <span
      className={cn(
        'font-display flex items-center gap-2.5 text-base font-semibold tracking-[-0.02em]',
        className,
      )}
    >
      <span
        aria-hidden="true"
        className="bg-brand-orange grid size-[34px] flex-none place-items-center rounded-[11px]"
      >
        <span className="block size-[13px] rounded-[3px] border-[2.5px] border-[#14213D]" />
      </span>
      {comNome ? <span>Solicitações</span> : <span className="sr-only">Solicitações</span>}
    </span>
  );
}
