import { BadRequestException, Controller, Get, Query } from '@nestjs/common';
import { z } from 'zod';
import { AnchorService } from './anchor.service';
import type { PublicVerifyResult } from './types/public-verify-result.type';

const QuerySchema = z.object({
  documentId: z.string().uuid(),
});

type PublicVerifyHttpResponse = Omit<PublicVerifyResult, 'timestampedAt'> & {
  timestampedAt: string;
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
      rootHex: result.rootHex,
      batchId: result.batchId,
      timestampedAt: result.timestampedAt.toISOString(),
    };
  }
}
