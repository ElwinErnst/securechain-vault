import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuthDirectoryService } from '../../common/modules/auth-directory/auth-directory.service';
import { DocumentEntity } from '../../database/entities/document.entity';
import { AnchorService } from '../anchor/anchor.service';
import type { PublicNotaryVerification } from './types/public-notary-verification.type';

export type NotaryStatus = 'PENDING' | 'ISSUED' | 'SIMULATED' | 'FAILED';

export type NotaryRecordView = {
  id: string;
  tenantId: string;
  documentId: string;
  documentSha256: string;
  status: NotaryStatus;
  provider: string;
  providerRef: string | null;
  issuedAt: string | null;
  verifiedAt: string | null;
  failureReason: string | null;
  createdAt: string;
  updatedAt: string;
};

@Injectable()
export class NotaryService {
  constructor(
    @InjectRepository(DocumentEntity)
    private readonly docsRepo: Repository<DocumentEntity>,
    private readonly anchorService: AnchorService,
    private readonly authDirectory: AuthDirectoryService,
  ) {}

  async issueDocument(opts: {
    tenantId: string;
    documentId: string;
  }): Promise<NotaryRecordView> {
    await this.assertNotaryEnabled(opts.tenantId);
    const doc = await this.getDocOrThrow(opts.tenantId, opts.documentId);

    if (doc.anchorStatus === 'ANCHORED' && doc.anchorTxHash && doc.anchoredAt) {
      return this.toRecordView(doc);
    }

    try {
      const anchored = await this.anchorService.anchorDocumentById(opts);
      return this.toRecordView(anchored.doc);
    } catch {
      doc.anchorStatus = 'PENDING';
      doc.anchorTxHash = null;
      doc.anchoredAt = null;
      doc.anchorChainId = null;
      await this.docsRepo.save(doc);

      return this.toRecordView(doc);
    }
  }

  async getDocumentStatus(
    tenantId: string,
    documentId: string,
  ): Promise<NotaryRecordView> {
    await this.assertNotaryEnabled(tenantId);
    const doc = await this.getDocOrThrow(tenantId, documentId);
    return this.toRecordView(doc);
  }

  async listDocumentRecords(
    tenantId: string,
    documentId: string,
  ): Promise<NotaryRecordView[]> {
    await this.assertNotaryEnabled(tenantId);
    const doc = await this.getDocOrThrow(tenantId, documentId);
    return [this.toRecordView(doc)];
  }

  async verifyPublic(documentId: string): Promise<PublicNotaryVerification> {
    const doc = await this.docsRepo.findOne({ where: { id: documentId } });

    if (!doc) {
      throw new NotFoundException('Document not found');
    }

    await this.assertNotaryEnabled(doc.tenantId);
    const verification =
      await this.anchorService.verifyDocumentPublic(documentId);

    return {
      ...verification,
      notaryStatus: this.mapAnchorStatus(doc.anchorStatus),
      provider: 'dummy-anchor',
      providerRef: doc.anchorTxHash,
      chainId: doc.anchorChainId,
    };
  }

  private async assertNotaryEnabled(tenantId: string): Promise<void> {
    const entitlements =
      await this.authDirectory.getTenantEntitlements(tenantId);

    if (!entitlements?.features.digitalNotary) {
      throw new ForbiddenException(
        'Digital Notary is not enabled for this tenant plan',
      );
    }
  }

  private async getDocOrThrow(
    tenantId: string,
    documentId: string,
  ): Promise<DocumentEntity> {
    const doc = await this.docsRepo.findOne({
      where: { id: documentId, tenantId },
    });

    if (!doc) {
      throw new NotFoundException('Document not found');
    }

    return doc;
  }

  private toRecordView(doc: DocumentEntity): NotaryRecordView {
    return {
      id: `doc-${doc.id}`,
      tenantId: doc.tenantId,
      documentId: doc.id,
      documentSha256: doc.sha256PlainHex,
      status: this.mapAnchorStatus(doc.anchorStatus),
      provider: 'dummy-anchor',
      providerRef: doc.anchorTxHash,
      issuedAt: doc.anchoredAt ? doc.anchoredAt.toISOString() : null,
      verifiedAt: doc.anchoredAt ? doc.anchoredAt.toISOString() : null,
      failureReason:
        doc.anchorStatus === 'FAILED'
          ? `Anchor failed after ${doc.anchorRetries} retries`
          : null,
      createdAt: doc.createdAt.toISOString(),
      updatedAt: (doc.anchoredAt ?? doc.createdAt).toISOString(),
    };
  }

  private mapAnchorStatus(
    status: DocumentEntity['anchorStatus'],
  ): NotaryStatus {
    if (status === 'ANCHORED') return 'ISSUED';
    if (status === 'SIMULATED') return 'SIMULATED';
    if (status === 'FAILED') return 'FAILED';
    return 'PENDING';
  }
}
