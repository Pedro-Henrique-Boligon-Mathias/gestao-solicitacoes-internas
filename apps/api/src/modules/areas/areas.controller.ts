import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ZodSerializerDto } from 'nestjs-zod';
import { Public } from '../../common/decorators/publico.decorator';
import { AreaDto } from './areas.dto';
import { AreasService } from './areas.service';

/**
 * ADR-012: pública. Áreas não têm dado sensível, e a lista é igual para todos: o servidor do
 * Next pode guardá-la em cache sem depender da sessão de ninguém.
 */
@ApiTags('áreas')
@Controller('areas')
export class AreasController {
  constructor(private readonly areas: AreasService) {}

  @Get()
  @Public()
  @ApiOperation({ operationId: 'listarAreas', summary: 'Áreas ativas, em ordem de nome (pública)' })
  @ApiOkResponse({ type: AreaDto, isArray: true, description: 'Áreas ativas' })
  @ZodSerializerDto([AreaDto])
  listar(): Promise<AreaDto[]> {
    return this.areas.listarAtivas();
  }
}
