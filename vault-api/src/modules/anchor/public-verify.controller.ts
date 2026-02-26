import { BadRequestException, Controller, Get, Query } from '@nestjs/common';
import { z } from 'zod';
import { AnchorService } from './anchor.service';

const QuerySchema = z.object({
  documentId: z.string().uuid(),
});

type PublicVerifyHttpResponse = {
  status: 'VALID' | 'MODIFIED' | 'NOT_ANCHORED';
  documentId: string;
  storedSha256: string;
  currentSha256: string;
  anchorTxHash: string | null;
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

    const result = await this.anchor.verifyDocument(parsed.data.documentId);

    return {
      status: result.status,
      documentId: result.documentId,
      storedSha256: result.storedSha256,
      currentSha256: result.currentSha256,
      anchorTxHash: result.anchorTxHash,
      anchoredAt: result.anchoredAt ? result.anchoredAt.toISOString() : null,
    };
  }
}
