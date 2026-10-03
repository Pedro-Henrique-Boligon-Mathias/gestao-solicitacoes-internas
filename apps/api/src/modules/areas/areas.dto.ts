import { createZodDto } from '../../common/zod/create-zod-dto';
import { z } from 'zod';

export const areaSchema = z.object({ id: z.uuid(), nome: z.string() });

export class AreaDto extends createZodDto(areaSchema) {}
