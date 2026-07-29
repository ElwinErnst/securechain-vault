import { BadRequestException, Controller, Get, Query } from '@nestjs/common';
import { z } from 'zod';
import { AnchorService } from './anchor.service';
import type { PublicVerifyResult } from './types/public-verify-result.type';

const QuerySchema = z.object({
  documentId: z.string().uuid(),
});

type PublicVerifyHttpResponse = Omit<PublicVerifyResult, 'anchoredAt'> & {
  anchoredAt: string | null;
};

@Controller('public')
export class PublicVerifyController {
  constructor(private readonly anchor: AnchorService) {}

  @Get('verify')
  async verify(@Query() query: unknown): Promise<PublicVerifyHttpResponse> {
    const parsed = QuerySchema.safeParse(query);

    if (!parsed.success) {
      throw new BadRequestException('Invalid documentId');
    }

    const result = await this.anchor.verifyDocumentPublic(
      parsed.data.documentId,
    );

    return {
      status: result.status,
      documentId: result.documentId,
      anchorTxHash: result.anchorTxHash,
      anchoredAt: result.anchoredAt ? result.anchoredAt.toISOString() : null,
    };
  }
}
