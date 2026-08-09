import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { DocumentEntity } from 'src/database/entities/document.entity';
import { StorageModule } from 'src/common/modules/storage/storage.module';

import { AnchorService, ANCHOR_CLIENT } from './anchor.service';
import { PublicVerifyController } from './public-verify.controller';
import type {
  AnchorClientPort,
  AnchorResult,
} from './ports/anchor-client.port';

// Simulated client for the MVP (until a real anchoring backend is wired in).
// It performs NO on-chain transaction, so it never returns a tx hash: callers
// must treat the result as unproven and never present it as blockchain proof.
class DummyAnchorClient implements AnchorClientPort {
  anchorDocumentHash(): Promise<AnchorResult> {
    return Promise.resolve({
      simulated: true,
      txHash: null,
      chainId: 31337,
      anchoredAt: new Date(),
    });
  }
}
//-------------------------------------------------------------------------------
// NOTA: el AnchorClientPort es un puerto para desacoplar la lógica de anclado de la implementación concreta (ethers, web3, http a otro servicio, etc).
// En tu AnchorModule registrás un provider con el token ANCHOR_CLIENT que apunte a la implementación concreta que quieras usar (en este ejemplo, DummyAnchorClient).
// Esto te permite cambiar la implementación concreta sin modificar la lógica de anclado (AnchorService), lo cual es útil para testing y para separar responsabilidades.
//-------------------------------------------------------------------------------

@Module({
  imports: [TypeOrmModule.forFeature([DocumentEntity]), StorageModule],
  controllers: [PublicVerifyController],
  providers: [
    AnchorService,
    { provide: ANCHOR_CLIENT, useClass: DummyAnchorClient },
  ],
  exports: [AnchorService],
})
export class AnchorModule {}
