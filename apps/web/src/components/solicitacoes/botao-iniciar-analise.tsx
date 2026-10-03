'use client';

import { useRouter } from 'next/navigation';
import { useTransition, type ComponentProps } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { iniciarAnalise } from '@/features/solicitacoes/actions';

/** Inicia a análise e leva ao detalhe (dashboard: "Iniciar a próxima" e itens da fila). */
export function BotaoIniciarAnalise({
  id,
  rotulo = 'Iniciar análise',
  ...props
}: { id: string; rotulo?: string } & Omit<ComponentProps<typeof Button>, 'onClick' | 'id'>) {
  const router = useRouter();
  const [iniciando, iniciar] = useTransition();

  return (
    <Button
      {...props}
      disabled={iniciando || props.disabled}
      onClick={() =>
        iniciar(async () => {
          const resultado = await iniciarAnalise(id);
          if (resultado.ok) {
            toast.success('Análise iniciada');
            router.push(`/solicitacoes/${id}`);
          } else {
            toast.error(resultado.erro, { duration: Infinity });
            router.refresh();
          }
        })
      }
    >
      {rotulo}
    </Button>
  );
}
