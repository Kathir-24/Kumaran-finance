import { Controller, Get, VERSION_NEUTRAL } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { BypassEnvelope } from './common/decorators/bypass-envelope.decorator';
import { AppService } from './app.service';

@ApiTags('Health')
@BypassEnvelope()
@Controller({ path: '', version: VERSION_NEUTRAL })
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  @ApiOperation({
    summary: 'Root ping endpoint',
    description: 'Returns basic service greeting.',
  })
  @ApiOkResponse({
    description: 'Service greeting',
    schema: {
      type: 'string',
      example: 'Hello World!',
    },
  })
  getHello(): string {
    return this.appService.getHello();
  }
}

