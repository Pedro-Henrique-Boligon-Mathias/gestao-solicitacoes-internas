import { redirect } from 'next/navigation';
import { Suspense, type ReactNode } from 'react';
import { MenuPrincipal } from '@/components/menu-principal';
import { BarraNavegacao } from '@/components/barra-navegacao';
import { CabecalhoAreaLogada } from '@/components/cabecalho-area-logada';
import { obterResumo } from '@/features/solicitacoes/consultas';
import { obterUsuarioAtual } from '@/lib/api/autenticado';

/** Saudação pela hora de Brasília. */
function saudacao(agora = new Date()): string {
  const hora = Number(
    new Intl.DateTimeFormat('pt-BR', {
      hour: 'numeric',
      hourCycle: 'h23',
      timeZone: 'America/Sao_Paulo',
    }).format(agora),
  );
  if (hora < 12) return 'Bom dia';
  if (hora < 18) return 'Boa tarde';
  return 'Boa noite';
}

/**
 * Tamanho da fila (solicitações abertas). Se o resumo falhar, o menu fica sem o número. O layout
 * não renderiza de novo na navegação pelo cliente: o número atualiza quando uma action chama
 * revalidatePath ou quando a página é recarregada. O `cache()` de obterResumo evita uma segunda
 * consulta quando o dashboard também pede o resumo.
 */
async function ContadorFila() {
  const resumo = await obterResumo();
  const fila = resumo.ok ? resumo.dados.porStatus.ABERTA : 0;
  if (fila <= 0) return null;
  return (
    <span className="bg-brand-orange rounded-pill ml-auto px-2 py-px font-mono text-xs font-medium text-[#14213D] tabular-nums max-[760px]:ml-0">
      <span className="sr-only">, </span>
      {fila}
      <span className="sr-only"> na fila</span>
    </span>
  );
}

/** Área logada: menu lateral (desktop) ou barra no rodapé (celular), cabeçalho e o conteúdo. */
export default async function LayoutAreaLogada({ children }: { children: ReactNode }) {
  const resultado = await obterUsuarioAtual();
  // Sessão recusada pela API com cookies ainda presentes: a rota limpa os cookies e leva ao login
  if (!resultado.autenticado) redirect('/api/sessao/encerrar');
  const { usuario } = resultado;
  const primeiroNome = usuario.nome.split(' ')[0];
  // Contador da fila no menu, só para quem analisa. Fica no próprio <Suspense> para o layout não
  // esperar o resumo: no carregamento completo, o dashboard sai em blocos (RF-04).
  const contador =
    usuario.cargo === 'SOLICITANTE' ? undefined : (
      <Suspense fallback={null}>
        <ContadorFila />
      </Suspense>
    );

  return (
    <div className="flex min-h-dvh items-start gap-4 p-4 max-[760px]:gap-3 max-[760px]:p-2.5 max-[760px]:pb-[calc(96px+env(safe-area-inset-bottom))]">
      {/* Desktop: menu lateral fixo na altura da tela; só a coluna de conteúdo rola */}
      <MenuPrincipal usuario={usuario} contador={contador} />
      <div className="flex min-w-0 flex-1 flex-col gap-4 max-[760px]:gap-3">
        <CabecalhoAreaLogada>
          <p className="font-display text-2xl leading-tight font-semibold tracking-[-0.03em]">
            {saudacao()}, <span className="text-muted-foreground font-normal">{primeiroNome}</span>
          </p>
        </CabecalhoAreaLogada>
        <main className="flex min-w-0 flex-col gap-4">{children}</main>
      </div>
      {/* Celular: navegação no rodapé, no lugar do menu lateral */}
      <BarraNavegacao usuario={usuario} contador={contador} />
    </div>
  );
}
