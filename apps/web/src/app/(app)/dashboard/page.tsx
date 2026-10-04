import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { DashboardAdmin } from '@/components/dashboard/dashboard-admin';
import { DashboardAnalista } from '@/components/dashboard/dashboard-analista';
import { DashboardSolicitante } from '@/components/dashboard/dashboard-solicitante';
import { lerPeriodo } from '@/features/dashboard/periodo';
import { obterUsuarioAtual } from '@/lib/api/autenticado';

export const metadata: Metadata = { title: 'Dashboard' };

/**
 * Dashboard: um por cargo (RF-04, Fase 3.5). Dados do usuário, sempre atuais (ADR-012). Só a
 * sessão é esperada aqui; cada dashboard dispara as próprias consultas juntas, o cabeçalho
 * aparece na hora e cada bloco chega no seu <Suspense>, com esqueleto e erro próprios (RNF-05).
 * O período (?periodo=, inválido vira `tudo`) vale só para os blocos de indicadores.
 */
export default async function PaginaDashboard({
  searchParams,
}: {
  searchParams: Promise<{ periodo?: string | string[] }>;
}) {
  const [sessao, busca] = await Promise.all([obterUsuarioAtual(), searchParams]);
  const periodo = lerPeriodo(busca.periodo);
  if (!sessao.autenticado) redirect('/api/sessao/encerrar');
  const { usuario } = sessao;

  if (usuario.cargo === 'SOLICITANTE') {
    return <DashboardSolicitante usuario={usuario} periodo={periodo} />;
  }
  if (usuario.cargo === 'ANALISTA')
    return <DashboardAnalista usuario={usuario} periodo={periodo} />;
  return <DashboardAdmin usuario={usuario} periodo={periodo} />;
}
