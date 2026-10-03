'use client';

import { EstadoErro } from '@/components/estado-erro';

/** Rede de segurança da área logada: mensagem amigável, o digest para o suporte e retry. */
export default function ErroAreaLogada({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  return (
    <section className="bg-card rounded-card">
      <EstadoErro
        titulo="Algo deu errado ao carregar esta página"
        requestId={error.digest}
        aoTentarNovamente={retry}
      />
    </section>
  );
}
