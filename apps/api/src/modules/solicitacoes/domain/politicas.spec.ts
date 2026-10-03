import { AcessoNegado, EdicaoBloqueada, SegregacaoDeFuncoes, TransicaoInvalida } from './erros';
import { acoesPermitidas, verificarAcao } from './politicas';

type Cargo = 'SOLICITANTE' | 'ANALISTA' | 'ADMIN';
type Status = 'ABERTA' | 'EM_ANALISE' | 'APROVADA' | 'REJEITADA';
type Acao = 'EDITAR' | 'EXCLUIR' | 'INICIAR_ANALISE' | 'DECIDIR' | 'REABRIR';
type Dono = 'dono' | 'outra pessoa';
type Responsavel = 'responsável' | 'outro analista';

/** Resultado de verificarAcao: permitido ou o `code` do erro lançado. */
type Desfecho =
  | 'PERMITIDO'
  | 'ACESSO_NEGADO'
  | 'SEGREGACAO_DE_FUNCOES'
  | 'TRANSICAO_INVALIDA'
  | 'EDICAO_BLOQUEADA';

const CARGOS: Cargo[] = ['SOLICITANTE', 'ANALISTA', 'ADMIN'];
const STATUS: Status[] = ['ABERTA', 'EM_ANALISE', 'APROVADA', 'REJEITADA'];
const ACOES: Acao[] = ['EDITAR', 'EXCLUIR', 'INICIAR_ANALISE', 'DECIDIR', 'REABRIR'];
const DECIDIDAS: Status[] = ['APROVADA', 'REJEITADA'];

const EU = '11111111-1111-4111-8111-111111111111';
const OUTRA_PESSOA = '22222222-2222-4222-8222-222222222222';
const OUTRO_ANALISTA = '33333333-3333-4333-8333-333333333333';

const CLASSES = {
  ACESSO_NEGADO: AcessoNegado,
  SEGREGACAO_DE_FUNCOES: SegregacaoDeFuncoes,
  TRANSICAO_INVALIDA: TransicaoInvalida,
  EDICAO_BLOQUEADA: EdicaoBloqueada,
} as const;

function usuario(cargo: Cargo) {
  return { id: EU, cargo };
}

/** Solicitação com o usuário (EU) como dono ou não e, fora de ABERTA, como responsável ou não. */
function solicitacao(status: Status, dono: Dono, responsavel: Responsavel = 'outro analista') {
  return {
    solicitanteId: dono === 'dono' ? EU : OUTRA_PESSOA,
    analistaId: status === 'ABERTA' ? null : responsavel === 'responsável' ? EU : OUTRO_ANALISTA,
    status,
  };
}

function desfecho(
  cargo: Cargo,
  status: Status,
  dono: Dono,
  acao: Acao,
  responsavel: Responsavel = 'outro analista',
): Desfecho {
  try {
    verificarAcao(usuario(cargo), solicitacao(status, dono, responsavel), acao);
    return 'PERMITIDO';
  } catch (erro) {
    for (const [codigo, Classe] of Object.entries(CLASSES)) {
      if (erro instanceof Classe) {
        expect(erro).toMatchObject({ code: codigo, detail: expect.any(String) });
        return codigo as Desfecho;
      }
    }
    throw erro;
  }
}

/** Todas as combinações possíveis (ninguém é responsável pela própria solicitação). */
const COMBINACOES: [Cargo, Status, Dono, Responsavel][] = CARGOS.flatMap((cargo) =>
  STATUS.flatMap((status) =>
    (['dono', 'outra pessoa'] as Dono[]).flatMap((dono) =>
      (['responsável', 'outro analista'] as Responsavel[])
        .filter((responsavel) => status !== 'ABERTA' || responsavel === 'outro analista')
        .filter((responsavel) => !(dono === 'dono' && responsavel === 'responsável'))
        .map((responsavel): [Cargo, Status, Dono, Responsavel] => [
          cargo,
          status,
          dono,
          responsavel,
        ]),
    ),
  ),
);

describe('Políticas de solicitação (verificarAcao e acoesPermitidas)', () => {
  describe('RN-02 / RN-08 / RN-09: EDITAR e EXCLUIR', () => {
    const TABELA: [Cargo, Status, Dono, Desfecho][] = [
      ['SOLICITANTE', 'ABERTA', 'dono', 'PERMITIDO'],
      ['SOLICITANTE', 'EM_ANALISE', 'dono', 'EDICAO_BLOQUEADA'],
      ['SOLICITANTE', 'APROVADA', 'dono', 'EDICAO_BLOQUEADA'],
      ['SOLICITANTE', 'REJEITADA', 'dono', 'EDICAO_BLOQUEADA'],
      ['SOLICITANTE', 'ABERTA', 'outra pessoa', 'ACESSO_NEGADO'],
      ['SOLICITANTE', 'EM_ANALISE', 'outra pessoa', 'ACESSO_NEGADO'],
      ['SOLICITANTE', 'APROVADA', 'outra pessoa', 'ACESSO_NEGADO'],
      ['SOLICITANTE', 'REJEITADA', 'outra pessoa', 'ACESSO_NEGADO'],
      ['ANALISTA', 'ABERTA', 'dono', 'PERMITIDO'],
      ['ANALISTA', 'EM_ANALISE', 'dono', 'EDICAO_BLOQUEADA'],
      ['ANALISTA', 'APROVADA', 'dono', 'EDICAO_BLOQUEADA'],
      ['ANALISTA', 'REJEITADA', 'dono', 'EDICAO_BLOQUEADA'],
      ['ANALISTA', 'ABERTA', 'outra pessoa', 'ACESSO_NEGADO'],
      ['ANALISTA', 'EM_ANALISE', 'outra pessoa', 'ACESSO_NEGADO'],
      ['ANALISTA', 'APROVADA', 'outra pessoa', 'ACESSO_NEGADO'],
      ['ANALISTA', 'REJEITADA', 'outra pessoa', 'ACESSO_NEGADO'],
      ['ADMIN', 'ABERTA', 'dono', 'PERMITIDO'],
      ['ADMIN', 'EM_ANALISE', 'dono', 'PERMITIDO'],
      ['ADMIN', 'APROVADA', 'dono', 'EDICAO_BLOQUEADA'],
      ['ADMIN', 'REJEITADA', 'dono', 'EDICAO_BLOQUEADA'],
      ['ADMIN', 'ABERTA', 'outra pessoa', 'PERMITIDO'],
      ['ADMIN', 'EM_ANALISE', 'outra pessoa', 'PERMITIDO'],
      ['ADMIN', 'APROVADA', 'outra pessoa', 'EDICAO_BLOQUEADA'],
      ['ADMIN', 'REJEITADA', 'outra pessoa', 'EDICAO_BLOQUEADA'],
    ];

    const LINHAS = (['EDITAR', 'EXCLUIR'] as const).flatMap((acao) =>
      TABELA.map(
        ([cargo, status, dono, esperado]) => [acao, cargo, status, dono, esperado] as const,
      ),
    );

    it.each(LINHAS)(
      'RN-02 / RN-08 / RN-09: %s por %s, %s, %s → %s',
      (acao, cargo, status, dono, esperado) => {
        expect(desfecho(cargo, status, dono, acao)).toBe(esperado);
      },
    );

    it('RN-02: o analista responsável não edita nem exclui a solicitação de outra pessoa', () => {
      for (const acao of ['EDITAR', 'EXCLUIR'] as const) {
        expect(desfecho('ANALISTA', 'EM_ANALISE', 'outra pessoa', acao, 'responsável')).toBe(
          'ACESSO_NEGADO',
        );
      }
    });
  });

  describe('RN-04: INICIAR_ANALISE', () => {
    const TABELA: [Cargo, Status, Dono, Desfecho][] = [
      ['SOLICITANTE', 'ABERTA', 'dono', 'ACESSO_NEGADO'],
      ['SOLICITANTE', 'EM_ANALISE', 'dono', 'ACESSO_NEGADO'],
      ['SOLICITANTE', 'APROVADA', 'dono', 'ACESSO_NEGADO'],
      ['SOLICITANTE', 'REJEITADA', 'dono', 'ACESSO_NEGADO'],
      ['SOLICITANTE', 'ABERTA', 'outra pessoa', 'ACESSO_NEGADO'],
      ['SOLICITANTE', 'EM_ANALISE', 'outra pessoa', 'ACESSO_NEGADO'],
      ['SOLICITANTE', 'APROVADA', 'outra pessoa', 'ACESSO_NEGADO'],
      ['SOLICITANTE', 'REJEITADA', 'outra pessoa', 'ACESSO_NEGADO'],
      ['ANALISTA', 'ABERTA', 'dono', 'SEGREGACAO_DE_FUNCOES'],
      ['ANALISTA', 'EM_ANALISE', 'dono', 'SEGREGACAO_DE_FUNCOES'],
      ['ANALISTA', 'APROVADA', 'dono', 'SEGREGACAO_DE_FUNCOES'],
      ['ANALISTA', 'REJEITADA', 'dono', 'SEGREGACAO_DE_FUNCOES'],
      ['ANALISTA', 'ABERTA', 'outra pessoa', 'PERMITIDO'],
      ['ANALISTA', 'EM_ANALISE', 'outra pessoa', 'TRANSICAO_INVALIDA'],
      ['ANALISTA', 'APROVADA', 'outra pessoa', 'TRANSICAO_INVALIDA'],
      ['ANALISTA', 'REJEITADA', 'outra pessoa', 'TRANSICAO_INVALIDA'],
      ['ADMIN', 'ABERTA', 'dono', 'SEGREGACAO_DE_FUNCOES'],
      ['ADMIN', 'EM_ANALISE', 'dono', 'SEGREGACAO_DE_FUNCOES'],
      ['ADMIN', 'APROVADA', 'dono', 'SEGREGACAO_DE_FUNCOES'],
      ['ADMIN', 'REJEITADA', 'dono', 'SEGREGACAO_DE_FUNCOES'],
      ['ADMIN', 'ABERTA', 'outra pessoa', 'PERMITIDO'],
      ['ADMIN', 'EM_ANALISE', 'outra pessoa', 'TRANSICAO_INVALIDA'],
      ['ADMIN', 'APROVADA', 'outra pessoa', 'TRANSICAO_INVALIDA'],
      ['ADMIN', 'REJEITADA', 'outra pessoa', 'TRANSICAO_INVALIDA'],
    ];

    it.each(TABELA)(
      'RN-04: INICIAR_ANALISE por %s, %s, %s → %s',
      (cargo, status, dono, esperado) => {
        expect(desfecho(cargo, status, dono, 'INICIAR_ANALISE')).toBe(esperado);
      },
    );
  });

  describe('RN-05: DECIDIR', () => {
    const TABELA: [Cargo, Status, Dono, Responsavel, Desfecho][] = [
      // Solicitante nunca decide
      ['SOLICITANTE', 'ABERTA', 'dono', 'outro analista', 'ACESSO_NEGADO'],
      ['SOLICITANTE', 'EM_ANALISE', 'dono', 'outro analista', 'ACESSO_NEGADO'],
      ['SOLICITANTE', 'APROVADA', 'dono', 'outro analista', 'ACESSO_NEGADO'],
      ['SOLICITANTE', 'REJEITADA', 'dono', 'outro analista', 'ACESSO_NEGADO'],
      ['SOLICITANTE', 'ABERTA', 'outra pessoa', 'outro analista', 'ACESSO_NEGADO'],
      ['SOLICITANTE', 'EM_ANALISE', 'outra pessoa', 'outro analista', 'ACESSO_NEGADO'],
      ['SOLICITANTE', 'APROVADA', 'outra pessoa', 'outro analista', 'ACESSO_NEGADO'],
      ['SOLICITANTE', 'REJEITADA', 'outra pessoa', 'outro analista', 'ACESSO_NEGADO'],
      // Analista
      ['ANALISTA', 'EM_ANALISE', 'outra pessoa', 'responsável', 'PERMITIDO'],
      ['ANALISTA', 'EM_ANALISE', 'outra pessoa', 'outro analista', 'ACESSO_NEGADO'],
      ['ANALISTA', 'ABERTA', 'outra pessoa', 'outro analista', 'TRANSICAO_INVALIDA'],
      ['ANALISTA', 'APROVADA', 'outra pessoa', 'responsável', 'TRANSICAO_INVALIDA'],
      ['ANALISTA', 'REJEITADA', 'outra pessoa', 'responsável', 'TRANSICAO_INVALIDA'],
      ['ANALISTA', 'APROVADA', 'outra pessoa', 'outro analista', 'TRANSICAO_INVALIDA'],
      ['ANALISTA', 'REJEITADA', 'outra pessoa', 'outro analista', 'TRANSICAO_INVALIDA'],
      ['ANALISTA', 'ABERTA', 'dono', 'outro analista', 'SEGREGACAO_DE_FUNCOES'],
      ['ANALISTA', 'EM_ANALISE', 'dono', 'outro analista', 'SEGREGACAO_DE_FUNCOES'],
      ['ANALISTA', 'APROVADA', 'dono', 'outro analista', 'SEGREGACAO_DE_FUNCOES'],
      ['ANALISTA', 'REJEITADA', 'dono', 'outro analista', 'SEGREGACAO_DE_FUNCOES'],
      // Admin decide sem ser o responsável
      ['ADMIN', 'EM_ANALISE', 'outra pessoa', 'outro analista', 'PERMITIDO'],
      ['ADMIN', 'EM_ANALISE', 'outra pessoa', 'responsável', 'PERMITIDO'],
      ['ADMIN', 'ABERTA', 'outra pessoa', 'outro analista', 'TRANSICAO_INVALIDA'],
      ['ADMIN', 'APROVADA', 'outra pessoa', 'outro analista', 'TRANSICAO_INVALIDA'],
      ['ADMIN', 'REJEITADA', 'outra pessoa', 'outro analista', 'TRANSICAO_INVALIDA'],
      ['ADMIN', 'ABERTA', 'dono', 'outro analista', 'SEGREGACAO_DE_FUNCOES'],
      ['ADMIN', 'EM_ANALISE', 'dono', 'outro analista', 'SEGREGACAO_DE_FUNCOES'],
      ['ADMIN', 'APROVADA', 'dono', 'outro analista', 'SEGREGACAO_DE_FUNCOES'],
      ['ADMIN', 'REJEITADA', 'dono', 'outro analista', 'SEGREGACAO_DE_FUNCOES'],
    ];

    it.each(TABELA)(
      'RN-05: DECIDIR por %s, %s, %s, analista %s → %s',
      (cargo, status, dono, responsavel, esperado) => {
        expect(desfecho(cargo, status, dono, 'DECIDIR', responsavel)).toBe(esperado);
      },
    );
  });

  describe('RN-07: segregação de funções', () => {
    const LINHAS = (['ANALISTA', 'ADMIN'] as const).flatMap((cargo) =>
      (['INICIAR_ANALISE', 'DECIDIR'] as const).flatMap((acao) =>
        STATUS.map((status) => [cargo, acao, status] as const),
      ),
    );

    it.each(LINHAS)(
      'RN-07: %s nunca executa %s na própria solicitação (%s) → SEGREGACAO_DE_FUNCOES',
      (cargo, acao, status) => {
        expect(desfecho(cargo, status, 'dono', acao)).toBe('SEGREGACAO_DE_FUNCOES');
      },
    );

    it.each(STATUS)('RN-07: ADMIN nunca reabre a própria solicitação (%s)', (status) => {
      expect(desfecho('ADMIN', status, 'dono', 'REABRIR')).toBe('SEGREGACAO_DE_FUNCOES');
    });

    it.each(
      CARGOS.flatMap((cargo) =>
        (['INICIAR_ANALISE', 'DECIDIR', 'REABRIR'] as const).flatMap((acao) =>
          STATUS.map((status) => [cargo, acao, status] as const),
        ),
      ),
    )('RN-07: %s dono nunca tem %s permitido (%s)', (cargo, acao, status) => {
      expect(desfecho(cargo, status, 'dono', acao)).not.toBe('PERMITIDO');
      expect(acoesPermitidas(usuario(cargo), solicitacao(status, 'dono'))).not.toContain(acao);
    });
  });

  describe('RN-16: REABRIR', () => {
    const TABELA: [Cargo, Status, Dono, Desfecho][] = [
      ['ADMIN', 'APROVADA', 'outra pessoa', 'PERMITIDO'],
      ['ADMIN', 'REJEITADA', 'outra pessoa', 'PERMITIDO'],
      ['ADMIN', 'ABERTA', 'outra pessoa', 'TRANSICAO_INVALIDA'],
      ['ADMIN', 'EM_ANALISE', 'outra pessoa', 'TRANSICAO_INVALIDA'],
      ['ADMIN', 'APROVADA', 'dono', 'SEGREGACAO_DE_FUNCOES'],
      ['ADMIN', 'REJEITADA', 'dono', 'SEGREGACAO_DE_FUNCOES'],
      ...(['SOLICITANTE', 'ANALISTA'] as const).flatMap((cargo) =>
        STATUS.flatMap((status) =>
          (['dono', 'outra pessoa'] as const).map((dono): [Cargo, Status, Dono, Desfecho] => [
            cargo,
            status,
            dono,
            'ACESSO_NEGADO',
          ]),
        ),
      ),
    ];

    it.each(TABELA)('RN-16: REABRIR por %s, %s, %s → %s', (cargo, status, dono, esperado) => {
      expect(desfecho(cargo, status, dono, 'REABRIR')).toBe(esperado);
    });

    it.each(DECIDIDAS)('RN-16: nem o analista responsável reabre uma %s', (status) => {
      expect(desfecho('ANALISTA', status, 'outra pessoa', 'REABRIR', 'responsável')).toBe(
        'ACESSO_NEGADO',
      );
    });
  });

  describe('Ordem das checagens: cargo → segregação → status → responsável', () => {
    it('cargo vem antes do status: SOLICITANTE iniciando análise de uma APROVADA → ACESSO_NEGADO', () => {
      expect(desfecho('SOLICITANTE', 'APROVADA', 'outra pessoa', 'INICIAR_ANALISE')).toBe(
        'ACESSO_NEGADO',
      );
    });

    it('segregação vem antes do status: ANALISTA decidindo a própria ABERTA → SEGREGACAO_DE_FUNCOES', () => {
      expect(desfecho('ANALISTA', 'ABERTA', 'dono', 'DECIDIR')).toBe('SEGREGACAO_DE_FUNCOES');
    });

    it('status vem antes do responsável: outro analista decidindo uma APROVADA → TRANSICAO_INVALIDA', () => {
      expect(desfecho('ANALISTA', 'APROVADA', 'outra pessoa', 'DECIDIR')).toBe(
        'TRANSICAO_INVALIDA',
      );
    });
  });

  describe('acoesPermitidas', () => {
    function ordenar(acoes: readonly string[]): string[] {
      return [...acoes].sort();
    }

    it('cobre todas as combinações de cargo × status × dono × responsável', () => {
      expect(COMBINACOES).toHaveLength(3 * (2 + 3 * 3));
    });

    it.each(COMBINACOES)(
      'coincide com verificarAcao para %s, %s, %s, analista %s',
      (cargo, status, dono, responsavel) => {
        const esperadas = ACOES.filter(
          (acao) => desfecho(cargo, status, dono, acao, responsavel) === 'PERMITIDO',
        );
        expect(
          ordenar(acoesPermitidas(usuario(cargo), solicitacao(status, dono, responsavel))),
        ).toEqual(ordenar(esperadas));
      },
    );

    it.each([
      ['SOLICITANTE', 'ABERTA', 'dono', 'outro analista', ['EDITAR', 'EXCLUIR']],
      ['SOLICITANTE', 'EM_ANALISE', 'dono', 'outro analista', []],
      ['ANALISTA', 'ABERTA', 'outra pessoa', 'outro analista', ['INICIAR_ANALISE']],
      ['ANALISTA', 'EM_ANALISE', 'outra pessoa', 'responsável', ['DECIDIR']],
      ['ANALISTA', 'EM_ANALISE', 'outra pessoa', 'outro analista', []],
      [
        'ADMIN',
        'ABERTA',
        'outra pessoa',
        'outro analista',
        ['EDITAR', 'EXCLUIR', 'INICIAR_ANALISE'],
      ],
      ['ADMIN', 'EM_ANALISE', 'outra pessoa', 'outro analista', ['EDITAR', 'EXCLUIR', 'DECIDIR']],
      ['ADMIN', 'APROVADA', 'outra pessoa', 'outro analista', ['REABRIR']],
      ['ADMIN', 'REJEITADA', 'dono', 'outro analista', []],
    ] as [Cargo, Status, Dono, Responsavel, Acao[]][])(
      'exemplo: %s, %s, %s, analista %s → %j',
      (cargo, status, dono, responsavel, esperadas) => {
        expect(
          ordenar(acoesPermitidas(usuario(cargo), solicitacao(status, dono, responsavel))),
        ).toEqual(ordenar(esperadas));
      },
    );
  });
});
