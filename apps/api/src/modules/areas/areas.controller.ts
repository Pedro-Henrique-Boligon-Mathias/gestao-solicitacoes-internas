import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ZodSerializerDto } from 'nestjs-zod';
import { ApiProblema } from '../../openapi/respostas';
import { AreaDto } from './areas.dto';
import { AreasService } from './areas.service';

@ApiTags('áreas')
@ApiBearerAuth('bearer')
@Controller('areas')
export class AreasController {
  constructor(private readonly areas: AreasService) {}

  @Get()
  @ApiOperation({ operationId: 'listarAreas', summary: 'Áreas ativas, em ordem de nome' })
  @ApiOkResponse({ type: AreaDto, isArray: true, description: 'Áreas ativas' })
  @ApiProblema(401, 'Sem token, token inválido ou sessão encerrada (NAO_AUTENTICADO)')
  @ZodSerializerDto([AreaDto])
  listar(): Promise<AreaDto[]> {
    return this.areas.listarAtivas();
  }
}
