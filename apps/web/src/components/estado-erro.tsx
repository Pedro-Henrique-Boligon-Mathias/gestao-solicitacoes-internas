'use client';

import { TriangleAlert } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { EstadoVazio } from './estado-vazio';

/**
 * Falha ao carregar os dados: mensagem amigável, o código para o suporte (requestId da API ou
 * digest do Next) e "Tentar novamente" (recarrega os dados da página).
 */
export function EstadoErro({
  requestId,
  aoTentarNovamente,
  titulo = 'Não foi possível carregar os dados',
}: {
  requestId?: string;
  aoTentarNovamente?: () => void;
  titulo?: string;
}) {
  const router = useRouter();

  return (
    <EstadoVazio
      Icone={TriangleAlert}
      titulo={titulo}
      acao={
        <Button onClick={() => (aoTentarNovamente ? aoTentarNovamente() : router.refresh())}>
          Tentar novamente
        </Button>
      }
    >
      <p>
        Tente de novo. Se continuar, informe o código para o suporte
        {requestId ? (
          <>
            : <code className="text-foreground font-mono text-[12.5px]">{requestId}</code>
          </>
        ) : (
          '.'
        )}
      </p>
    </EstadoVazio>
  );
}
