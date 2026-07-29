import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { DocumentEntity } from 'src/database/entities/document.entity';
import { StorageModule } from 'src/common/modules/storage/storage.module';

import { AnchorService, ANCHOR_CLIENT } from './anchor.service';
import { PublicVerifyController } from './public-verify.controller';
import type { AnchorClientPort } from './ports/anchor-client.port';

// Cliente dummy para MVP (hasta que conectemos contrato real)
class DummyAnchorClient implements AnchorClientPort {
  anchorDocumentHash(): Promise<{
    txHash: string;
    chainId: number;
    anchoredAt: Date;
  }> {
    return Promise.resolve({
      txHash: '0xDUMMY',
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
