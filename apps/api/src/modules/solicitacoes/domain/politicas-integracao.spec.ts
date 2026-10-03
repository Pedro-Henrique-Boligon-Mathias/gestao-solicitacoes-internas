import { AcessoNegado, TransicaoInvalida } from './erros';
import { acoesPermitidas, verificarAcao } from './politicas';
import type { SolicitacaoDominio } from './tipos';

type Cargo = 'SOLICITANTE' | 'ANALISTA' | 'ADMIN';
type Status = 'ABERTA' | 'EM_ANALISE' | 'APROVADA' | 'REJEITADA';
/**
 * Status do evento em foco: o mais antigo ainda não ENVIADO (é ele que segura a fila, pela ordem
 * estrita) ou, se todos foram enviados, o mais recente. null = nenhum evento.
 */
type StatusIntegracao = 'PENDENTE' | 'ENVIADO' | 'FALHOU' | null;

const CARGOS: Cargo[] = ['SOLICITANTE', 'ANALISTA', 'ADMIN'];
const STATUS: Status[] = ['ABERTA', 'EM_ANALISE', 'APROVADA', 'REJEITADA'];
const INTEGRACOES: StatusIntegracao[] = [null, 'PENDENTE', 'ENVIADO', 'FALHOU'];

const EU = '11111111-1111-4111-8111-111111111111';
const OUTRA_PESSOA = '22222222-2222-4222-8222-222222222222';
const OUTRO_ANALISTA = '33333333-3333-4333-8333-333333333333';

function solicitacao(status: Status, statusIntegracao: StatusIntegracao): SolicitacaoDominio {
  return {
    solicitanteId: OUTRA_PESSOA,
    analistaId: status === 'ABERTA' ? null : OUTRO_ANALISTA,
    status,
    statusIntegracao,
  };
}

const COMBINACOES = CARGOS.flatMap((cargo) =>
  STATUS.flatMap((status) => INTEGRACOES.map((integracao) => [cargo, status, integracao] as const)),
);

describe('ADR-010: REPROCESSAR_INTEGRACAO na política de domínio', () => {
  it.each(COMBINACOES)(
    'ADR-010: %s, solicitação %s, evento em foco %s → REPROCESSAR_INTEGRACAO só para ADMIN com FALHOU',
    (cargo, status, integracao) => {
      const acoes = acoesPermitidas({ id: EU, cargo }, solicitacao(status, integracao));
      if (cargo === 'ADMIN' && integracao === 'FALHOU') {
        expect(acoes).toContain('REPROCESSAR_INTEGRACAO');
      } else {
        expect(acoes).not.toContain('REPROCESSAR_INTEGRACAO');
      }
    },
  );

  it('ADR-010: sem o dado de integração (campo ausente), ninguém reprocessa', () => {
    const semCampo = {
      solicitanteId: OUTRA_PESSOA,
      analistaId: OUTRO_ANALISTA,
      status: 'APROVADA' as const,
    };
    expect(acoesPermitidas({ id: EU, cargo: 'ADMIN' }, semCampo)).not.toContain(
      'REPROCESSAR_INTEGRACAO',
    );
  });

  it('ADR-010: o dado de integração não muda as outras ações (ADMIN, APROVADA → REABRIR e REPROCESSAR_INTEGRACAO)', () => {
    expect(
      [...acoesPermitidas({ id: EU, cargo: 'ADMIN' }, solicitacao('APROVADA', 'FALHOU'))].sort(),
    ).toEqual(['REABRIR', 'REPROCESSAR_INTEGRACAO']);
    expect(acoesPermitidas({ id: EU, cargo: 'ADMIN' }, solicitacao('APROVADA', 'ENVIADO'))).toEqual(
      ['REABRIR'],
    );
  });

  it.each(['SOLICITANTE', 'ANALISTA'] as const)(
    'ADR-010: verificarAcao com %s → ACESSO_NEGADO (403), mesmo com o evento em foco em FALHOU',
    (cargo) => {
      const tentar = () =>
        verificarAcao(
          { id: EU, cargo },
          solicitacao('APROVADA', 'FALHOU'),
          'REPROCESSAR_INTEGRACAO',
        );
      expect(tentar).toThrow(AcessoNegado);
      try {
        tentar();
      } catch (erro) {
        expect(erro).toMatchObject({ code: 'ACESSO_NEGADO', detail: expect.any(String) });
      }
    },
  );

  it.each([null, 'PENDENTE', 'ENVIADO'] as const)(
    'ADR-010: verificarAcao com ADMIN e evento em foco %s → TRANSICAO_INVALIDA (409)',
    (integracao) => {
      const tentar = () =>
        verificarAcao(
          { id: EU, cargo: 'ADMIN' },
          solicitacao('APROVADA', integracao),
          'REPROCESSAR_INTEGRACAO',
        );
      expect(tentar).toThrow(TransicaoInvalida);
      try {
        tentar();
      } catch (erro) {
        expect(erro).toMatchObject({ code: 'TRANSICAO_INVALIDA', detail: expect.any(String) });
      }
    },
  );

  it('ADR-010: verificarAcao com ADMIN e evento em foco FALHOU → permitido', () => {
    expect(() =>
      verificarAcao(
        { id: EU, cargo: 'ADMIN' },
        solicitacao('ABERTA', 'FALHOU'),
        'REPROCESSAR_INTEGRACAO',
      ),
    ).not.toThrow();
  });
});
