import type { UploadDocumentFile } from './upload-document-file.type';

export type UploadDocumentOptions = {
  tenantId: string;
  userId: string;
  vaultId: string;
  file: UploadDocumentFile;
  name?: string;
};
