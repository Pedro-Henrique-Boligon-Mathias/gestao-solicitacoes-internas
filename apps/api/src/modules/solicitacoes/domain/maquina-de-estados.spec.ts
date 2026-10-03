import { TransicaoInvalida } from './erros';
import { transicionar } from './maquina-de-estados';

type Status = 'ABERTA' | 'EM_ANALISE' | 'APROVADA' | 'REJEITADA';
type Comando = 'INICIAR_ANALISE' | 'APROVAR' | 'REJEITAR' | 'REABRIR';

const STATUS: Status[] = ['ABERTA', 'EM_ANALISE', 'APROVADA', 'REJEITADA'];
const COMANDOS: Comando[] = ['INICIAR_ANALISE', 'APROVAR', 'REJEITAR', 'REABRIR'];

// Tabela de transições da nota de domínio (sem "devolver à fila", que é P2).
const VALIDAS: [Status, Comando, Status][] = [
  ['ABERTA', 'INICIAR_ANALISE', 'EM_ANALISE'],
  ['EM_ANALISE', 'APROVAR', 'APROVADA'],
  ['EM_ANALISE', 'REJEITAR', 'REJEITADA'],
  ['APROVADA', 'REABRIR', 'ABERTA'],
  ['REJEITADA', 'REABRIR', 'ABERTA'],
];

const INVALIDAS: [Status, Comando][] = STATUS.flatMap((status) =>
  COMANDOS.filter(
    (comando) => !VALIDAS.some(([de, valido]) => de === status && valido === comando),
  ).map((comando): [Status, Comando] => [status, comando]),
);

describe('RN-03 / RN-11: máquina de estados (transicionar)', () => {
  it.each(VALIDAS)('%s + %s → %s', (de, comando, para) => {
    expect(transicionar(de, comando)).toBe(para);
  });

  it('cobre as 11 combinações inválidas de status × comando', () => {
    expect(INVALIDAS).toHaveLength(11);
  });

  it.each(INVALIDAS)('%s + %s lança TransicaoInvalida (409 TRANSICAO_INVALIDA)', (de, comando) => {
    let erro: unknown;
    try {
      transicionar(de, comando);
    } catch (lancado) {
      erro = lancado;
    }
    expect(erro).toBeInstanceOf(TransicaoInvalida);
    expect(erro).toMatchObject({ code: 'TRANSICAO_INVALIDA', detail: expect.any(String) });
    expect((erro as TransicaoInvalida).detail.length).toBeGreaterThan(0);
  });

  it('aprovar uma ABERTA explica que a análise precisa ser iniciada antes', () => {
    expect(() => transicionar('ABERTA', 'APROVAR')).toThrow(
      'Uma solicitação com status Aberta não pode ser aprovada. Inicie a análise primeiro.',
    );
  });
});
