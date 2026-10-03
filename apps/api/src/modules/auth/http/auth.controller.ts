import { Body, Controller, Get, HttpCode, HttpStatus, Post, Req, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import type { Request } from 'express';
import { ZodSerializerDto } from 'nestjs-zod';
import type {
  RequisicaoAutenticada,
  UsuarioAutenticado,
} from '../../../common/context/usuario-autenticado';
import { Public } from '../../../common/decorators/publico.decorator';
import { UsuarioAtual } from '../../../common/decorators/usuario-atual.decorator';
import { NaoAutenticadoError } from '../../../common/errors/erro-de-dominio';
import { ApiProblema } from '../../../openapi/respostas';
import {
  AutenticacaoService,
  type Origem,
  type SessaoEmitida,
} from '../application/autenticacao.service';
import { LoginDto, RefreshDto, RespostaSessaoDto, UsuarioAtualDto } from './auth.dto';
import { LimitarPor, LimiteDeTentativasGuard } from './limite-de-tentativas.guard';

/**
 * IP do navegador (o Next repassa em X-Forwarded-For; a API só confia nesse header vindo de
 * redes internas, ver configurarApp) e o User-Agent.
 */
function origemDa(requisicao: Request): Origem {
  const ip = requisicao.ip?.replace(/^::ffff:/, '') ?? null;
  return { ip, userAgent: requisicao.headers['user-agent'] ?? null };
}

function paraResposta(sessao: SessaoEmitida): RespostaSessaoDto {
  return {
    ...sessao,
    accessExpiraEm: sessao.accessExpiraEm.toISOString(),
    refreshExpiraEm: sessao.refreshExpiraEm.toISOString(),
  };
}

@ApiTags('autenticação')
@Controller('auth')
export class AuthController {
  constructor(private readonly autenticacao: AutenticacaoService) {}

  @Post('login')
  @LimitarPor('email')
  @Public()
  @UseGuards(LimiteDeTentativasGuard)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ operationId: 'login', summary: 'Autentica e abre uma sessão' })
  @ApiOkResponse({ type: RespostaSessaoDto, description: 'Sessão aberta' })
  @ApiProblema(400, 'Corpo inválido (DADOS_INVALIDOS)')
  @ApiProblema(401, 'E-mail ou senha inválidos (CREDENCIAIS_INVALIDAS)')
  @ApiProblema(429, 'Mais de 5 tentativas por minuto para o mesmo e-mail (MUITAS_TENTATIVAS)')
  @ZodSerializerDto(RespostaSessaoDto)
  async login(@Body() corpo: LoginDto, @Req() requisicao: Request): Promise<RespostaSessaoDto> {
    return paraResposta(
      await this.autenticacao.entrar(corpo.email, corpo.senha, origemDa(requisicao)),
    );
  }

  @Post('refresh')
  @LimitarPor('refreshToken')
  @Public()
  @UseGuards(LimiteDeTentativasGuard)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ operationId: 'renovarSessao', summary: 'Troca o refresh token por um novo par' })
  @ApiOkResponse({ type: RespostaSessaoDto, description: 'Novo par de tokens' })
  @ApiProblema(400, 'Corpo inválido (DADOS_INVALIDOS)')
  @ApiProblema(401, 'Refresh token desconhecido, expirado, revogado ou reusado (SESSAO_INVALIDA)')
  @ApiProblema(429, 'Mais de 5 renovações por minuto com o mesmo refresh token (MUITAS_TENTATIVAS)')
  @ZodSerializerDto(RespostaSessaoDto)
  async refresh(@Body() corpo: RefreshDto, @Req() requisicao: Request): Promise<RespostaSessaoDto> {
    return paraResposta(await this.autenticacao.renovar(corpo.refreshToken, origemDa(requisicao)));
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiBearerAuth('bearer')
  @ApiOperation({ operationId: 'logout', summary: 'Encerra a sessão (revoga a família inteira)' })
  @ApiNoContentResponse({ description: 'Sessão encerrada' })
  @ApiProblema(401, 'Sem token, token inválido ou sessão já encerrada (NAO_AUTENTICADO)')
  async logout(@Req() requisicao: RequisicaoAutenticada): Promise<void> {
    if (!requisicao.sessaoId) throw new NaoAutenticadoError();
    await this.autenticacao.sair(requisicao.sessaoId);
  }

  @Get('me')
  @ApiBearerAuth('bearer')
  @ApiOperation({ operationId: 'usuarioAtual', summary: 'Usuário autenticado, com a área' })
  @ApiOkResponse({ type: UsuarioAtualDto, description: 'Usuário atual' })
  @ApiProblema(401, 'Sem token, token inválido ou sessão encerrada (NAO_AUTENTICADO)')
  @ZodSerializerDto(UsuarioAtualDto)
  me(@UsuarioAtual() usuario: UsuarioAutenticado): Promise<UsuarioAtualDto> {
    return this.autenticacao.usuarioAtual(usuario.id);
  }
}
