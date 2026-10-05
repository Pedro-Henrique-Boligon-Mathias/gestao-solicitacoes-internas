import { createZodDto } from '../../common/zod/create-zod-dto';
import { z } from 'zod';
import { EXEMPLO } from '../../openapi/exemplos';
import { eventoHistoricoSchema } from '../solicitacoes/http/solicitacoes.dto';
import { LIMITE_DIVERGENCIAS, MOTIVOS_DIVERGENCIA } from './domain/integridade';

const contagem = z.int().min(0);

export const divergenciaSchema = z
  .object({
    solicitacao: z.object({
      id: z.uuid().meta({ example: EXEMPLO.solicitacaoId }),
      codigo: z.string().meta({ example: EXEMPLO.codigo }),
      excluida: z
        .boolean()
        .describe('true quando a solicitação foi excluída logicamente (o detalhe não abre mais)'),
    }),
    eventoId: z.uuid().meta({ example: EXEMPLO.historicoId }),
    tipo: eventoHistoricoSchema.shape.tipo,
    criadoEm: z.iso.datetime().meta({ example: '2026-10-03T10:12:00.000Z' }),
    motivo: z
      .enum(MOTIVOS_DIVERGENCIA)
      .describe(
        'CONTEUDO_ALTERADO: o conteúdo do evento não confere com o hash gravado; ' +
          'CORRENTE_QUEBRADA: o evento não aponta para o anterior (evento apagado ou inserido no meio)',
      )
      .meta({ id: 'MotivoDivergencia', example: 'CONTEUDO_ALTERADO' }),
  })
  .meta({ id: 'DivergenciaHistorico' });

export const integridadeSchema = z.object({
  integro: z.boolean().describe('true quando nenhuma divergência foi encontrada'),
  eventosVerificados: contagem.meta({ example: 412 }),
  solicitacoesVerificadas: contagem
    .describe('Inclui solicitações excluídas logicamente')
    .meta({ example: 40 }),
  totalDivergencias: contagem.meta({ example: 1 }),
  divergencias: z
    .array(divergenciaSchema)
    .max(LIMITE_DIVERGENCIAS)
    .describe(`Até ${LIMITE_DIVERGENCIAS}, da mais antiga para a mais recente`),
  verificadoEm: z.iso.datetime().meta({ example: '2026-10-04T10:15:00.000Z' }),
});

export class IntegridadeDto extends createZodDto(integridadeSchema) {}
