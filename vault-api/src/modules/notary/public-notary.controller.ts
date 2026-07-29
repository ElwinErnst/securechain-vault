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
    Omit<PublicNotaryVerification, 'anchoredAt'> & { anchoredAt: string | null }
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
      providerRef: result.providerRef,
      chainId: result.chainId,
      anchorTxHash: result.anchorTxHash,
      anchoredAt: result.anchoredAt ? result.anchoredAt.toISOString() : null,
    };
  }
}
