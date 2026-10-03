import { Controller, Get, HttpStatus, Res } from '@nestjs/common';
import {
  ApiOkResponse,
  ApiOperation,
  ApiServiceUnavailableResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { Response } from 'express';
import { Public } from '../../common/decorators/publico.decorator';
import { ZodSerializerDto } from 'nestjs-zod';
import { RespostaProntidaoDto, RespostaVivacidadeDto, type RespostaProntidao } from './health.dto';
import { VerificadorBanco } from './verificador-banco';

@ApiTags('saúde')
@Public()
@Controller('health')
export class HealthController {
  constructor(private readonly banco: VerificadorBanco) {}

  @Get('live')
  @ApiOperation({ operationId: 'vivacidade', summary: 'O processo está de pé (liveness)' })
  @ApiOkResponse({ type: RespostaVivacidadeDto, description: 'Processo de pé' })
  @ZodSerializerDto(RespostaVivacidadeDto)
  live(): RespostaVivacidadeDto {
    return { status: 'ok' };
  }

  @Get('ready')
  @ApiOperation({
    operationId: 'prontidao',
    summary: 'A API consegue atender, com banco acessível (readiness)',
  })
  @ApiOkResponse({ type: RespostaProntidaoDto, description: 'Pronta para atender' })
  @ApiServiceUnavailableResponse({
    type: RespostaProntidaoDto,
    description: 'Algum componente está fora do ar',
  })
  @ZodSerializerDto(RespostaProntidaoDto)
  async ready(@Res({ passthrough: true }) resposta: Response): Promise<RespostaProntidao> {
    const database = await this.banco.verificar();
    const pronta = database === 'up';
    resposta.status(pronta ? HttpStatus.OK : HttpStatus.SERVICE_UNAVAILABLE);
    return { status: pronta ? 'ok' : 'error', details: { database: { status: database } } };
  }
}
