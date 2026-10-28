import {
  Body,
  Controller,
  ForbiddenException,
  Header,
  HttpCode,
  Param,
  Post,
  Req,
  StreamableFile,
  UseGuards,
} from '@nestjs/common';
import {
  ActorContextAdapter,
  type ActorContextRequest,
} from '../access/actor-context.adapter.js';
import { ProjectPdfBundleService } from './project-pdf-bundle.service.js';
@Controller('projects/:projectId/pdf-bundle')
@UseGuards(ActorContextAdapter)
export class ProjectPdfBundleController {
  constructor(private readonly bundles: ProjectPdfBundleService) {}
  @Post()
  @HttpCode(200)
  @Header('Cache-Control', 'private, no-store')
  @Header('X-Content-Type-Options', 'nosniff')
  async download(
    @Req() request: ActorContextRequest,
    @Param('projectId') projectId: string,
    @Body() body: unknown,
  ) {
    if (!request.actorContext) throw new ForbiddenException();
    const archive = await this.bundles.prepare(
      request.actorContext,
      projectId,
      body,
    );
    return new StreamableFile(Buffer.from(archive), {
      type: 'application/zip',
      length: archive.byteLength,
      disposition: 'attachment; filename="selected-project-pdfs.zip"',
    });
  }
}
