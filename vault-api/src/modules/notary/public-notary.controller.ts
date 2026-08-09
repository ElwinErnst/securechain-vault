import { BadRequestException, Controller, Get, Param } from '@nestjs/common';
import { z } from 'zod';
import { NotaryService } from './notary.service';
import type { PublicNotaryVerification } from './types/public-notary-verification.type';

const IdParamSchema = z.object({
  documentId: z.string().uuid(),
});

@Controller('public/notary')
export class PublicNotaryController {
  constructor(private readonly notaryService: NotaryService) {}

  @Get('verify/:documentId')
  async verify(
    @Param() params: unknown,
  ): Promise<
    Omit<PublicNotaryVerification, 'timestampedAt'> & { timestampedAt: string }
  > {
    const parsed = IdParamSchema.safeParse(params);
    if (!parsed.success) {
      throw new BadRequestException('Invalid documentId');
    }

    const result = await this.notaryService.verifyPublic(
      parsed.data.documentId,
    );

    return {
      status: result.status,
      notaryStatus: result.notaryStatus,
      documentId: result.documentId,
      provider: result.provider,
      rootHex: result.rootHex,
      batchId: result.batchId,
      timestampedAt: result.timestampedAt.toISOString(),
    };
  }
}
