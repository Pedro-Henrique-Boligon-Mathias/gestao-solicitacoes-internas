import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { DashboardAdmin } from '@/components/dashboard/dashboard-admin';
import { DashboardAnalista } from '@/components/dashboard/dashboard-analista';
import { DashboardSolicitante } from '@/components/dashboard/dashboard-solicitante';
import { obterUsuarioAtual } from '@/lib/api/autenticado';

export const metadata: Metadata = { title: 'Dashboard' };

/**
 * Dashboard: um por cargo (RF-04, Fase 3.5). Dados do usuário, sempre atuais (ADR-012). Só a
 * sessão é esperada aqui; cada dashboard dispara as próprias consultas juntas, o cabeçalho
 * aparece na hora e cada bloco chega no seu <Suspense>, com esqueleto e erro próprios (RNF-05).
 */
export default async function PaginaDashboard() {
  const sessao = await obterUsuarioAtual();
  if (!sessao.autenticado) redirect('/api/sessao/encerrar');
  const { usuario } = sessao;

  if (usuario.cargo === 'SOLICITANTE') return <DashboardSolicitante usuario={usuario} />;
  if (usuario.cargo === 'ANALISTA') return <DashboardAnalista usuario={usuario} />;
  return <DashboardAdmin usuario={usuario} />;
}
