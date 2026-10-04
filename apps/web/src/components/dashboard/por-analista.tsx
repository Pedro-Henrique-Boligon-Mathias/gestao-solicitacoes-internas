import { useId } from 'react';
import { TabelaAnalistas, type AnalistaGestao } from './tabela-analistas';
import { VerTodosAnalistas } from './ver-todos-analistas';

const LIMITE = 5;

/**
 * "Por analista" do painel de gestão (RF-04): até 5 linhas na ordem da API (mais carregados
 * primeiro). Acima disso, "Ver todos os N analistas" abre o modal com a tabela completa.
 */
export function PorAnalista({ analistas }: { analistas: AnalistaGestao[] }) {
  const idTitulo = useId();
  return (
    <section
      aria-labelledby={idTitulo}
      className="bg-card rounded-card flex min-w-0 flex-col gap-2 p-5 max-[760px]:p-4"
    >
      <div>
        <h2
          id={idTitulo}
          className="font-display text-lg leading-[1.2] font-semibold tracking-[-0.02em]"
        >
          Por analista
        </h2>
        <p className="text-muted-foreground text-[13px]">
          {analistas.length > 0
            ? 'Os mais carregados primeiro · cada linha abre a lista filtrada'
            : 'Nenhum analista com análise agora ou decisão no período'}
        </p>
      </div>
      {analistas.length > 0 && <TabelaAnalistas analistas={analistas.slice(0, LIMITE)} />}
      {analistas.length > LIMITE && <VerTodosAnalistas analistas={analistas} />}
    </section>
  );
}
