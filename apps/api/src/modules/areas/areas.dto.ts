import { createZodDto } from '../../common/zod/create-zod-dto';
import { z } from 'zod';
import { EXEMPLO } from '../../openapi/exemplos';

export const areaSchema = z.object({
  id: z.uuid().meta({ example: EXEMPLO.financeiro.id }),
  nome: z.string().meta({ example: EXEMPLO.financeiro.nome }),
});

export class AreaDto extends createZodDto(areaSchema) {}
