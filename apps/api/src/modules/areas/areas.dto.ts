import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export const areaSchema = z.object({ id: z.uuid(), nome: z.string() });

export class AreaDto extends createZodDto(areaSchema) {}
