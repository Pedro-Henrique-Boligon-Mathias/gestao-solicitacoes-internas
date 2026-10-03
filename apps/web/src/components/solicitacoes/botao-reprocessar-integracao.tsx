'use client';

import { RotateCcw } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useTransition } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { reprocessarIntegracao } from '@/features/solicitacoes/actions';

/** Devolve para a fila o evento de integração que falhou e recarrega o detalhe. */
export function BotaoReprocessarIntegracao({ id }: { id: string }) {
  const router = useRouter();
  const [reprocessando, reprocessar] = useTransition();

  return (
    <Button
      variant="outline"
      size="sm"
      disabled={reprocessando}
      onClick={() =>
        reprocessar(async () => {
          const resultado = await reprocessarIntegracao(id);
          if (resultado.ok) toast.success('Integração devolvida para a fila');
          else toast.error(resultado.erro, { duration: Infinity });
          router.refresh();
        })
      }
    >
      <RotateCcw aria-hidden="true" />
      Reprocessar integração
    </Button>
  );
}
