import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { lerConfiguracao } from './configuracao.ts';

describe('ext-mock: configuração por variáveis de ambiente', () => {
  it('padrões: porta 4010 e taxa de falha 0', () => {
    assert.deepEqual(lerConfiguracao({}), { porta: 4010, taxaDeFalha: 0 });
  });

  it('lê MOCK_PORTA e MOCK_FAILURE_RATE', () => {
    assert.deepEqual(lerConfiguracao({ MOCK_PORTA: '5050', MOCK_FAILURE_RATE: '0.5' }), {
      porta: 5050,
      taxaDeFalha: 0.5,
    });
  });

  it('aceita os extremos 0 e 1', () => {
    assert.equal(lerConfiguracao({ MOCK_FAILURE_RATE: '0' }).taxaDeFalha, 0);
    assert.equal(lerConfiguracao({ MOCK_FAILURE_RATE: '1' }).taxaDeFalha, 1);
  });

  for (const invalida of ['-0.1', '1.5', 'metade']) {
    it(`MOCK_FAILURE_RATE inválida (${JSON.stringify(invalida)}) → erro na subida`, () => {
      assert.throws(() => lerConfiguracao({ MOCK_FAILURE_RATE: invalida }));
    });
  }

  for (const invalida of ['0', '70000', 'porta', '-1']) {
    it(`MOCK_PORTA inválida (${JSON.stringify(invalida)}) → erro na subida`, () => {
      assert.throws(() => lerConfiguracao({ MOCK_PORTA: invalida }));
    });
  }
});
