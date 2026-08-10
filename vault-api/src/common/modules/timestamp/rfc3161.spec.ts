import { createHash } from 'crypto';

import { AsnConvert, OctetString } from '@peculiar/asn1-schema';
import { AlgorithmIdentifier } from '@peculiar/asn1-x509';
import {
  CMSVersion,
  DigestAlgorithmIdentifiers,
  EncapsulatedContent,
  EncapsulatedContentInfo,
  SignerInfos,
  SignedData,
} from '@peculiar/asn1-cms';
import {
  MessageImprint,
  PKIStatus,
  PKIStatusInfo,
  TimeStampReq,
  TimeStampResp,
  TimeStampToken,
  TSTInfo,
  TSTInfoVersion,
} from '@peculiar/asn1-tsp';

import { buildTimeStampRequest, parseTimeStampResponse } from './rfc3161';

const SHA256_OID = '2.16.840.1.101.3.4.2.1';
const ID_SIGNED_DATA = '1.2.840.113549.1.7.2';
const ID_CT_TST_INFO = '1.2.840.113549.1.9.16.1.4';

function octetToHex(oct: ArrayBufferView): string {
  return Buffer.from(oct.buffer, oct.byteOffset, oct.byteLength).toString(
    'hex',
  );
}

/** Build a granted TimeStampResp whose token embeds a TSTInfo with the given fields. */
function grantedResponse(opts: {
  rootHex: string;
  serialHex: string;
  genTime: Date;
}): ArrayBuffer {
  const tstInfo = new TSTInfo({
    version: TSTInfoVersion.v1,
    policy: '1.2.3.4.5',
    messageImprint: new MessageImprint({
      hashAlgorithm: new AlgorithmIdentifier({
        algorithm: SHA256_OID,
        parameters: null,
      }),
      hashedMessage: new OctetString(Buffer.from(opts.rootHex, 'hex')),
    }),
    serialNumber: Uint8Array.from(Buffer.from(opts.serialHex, 'hex')).buffer,
    genTime: opts.genTime,
    ordering: false,
  });

  const signedData = new SignedData({
    version: CMSVersion.v3,
    digestAlgorithms: new DigestAlgorithmIdentifiers([]),
    encapContentInfo: new EncapsulatedContentInfo({
      eContentType: ID_CT_TST_INFO,
      eContent: new EncapsulatedContent({
        single: new OctetString(AsnConvert.serialize(tstInfo)),
      }),
    }),
    signerInfos: new SignerInfos([]),
  });

  const resp = new TimeStampResp({
    status: new PKIStatusInfo({ status: PKIStatus.granted }),
    timeStampToken: new TimeStampToken({
      contentType: ID_SIGNED_DATA,
      content: AsnConvert.serialize(signedData),
    }),
  });

  return AsnConvert.serialize(resp);
}

describe('rfc3161', () => {
  const rootHex = createHash('sha256').update('merkle root').digest('hex');

  it('builds a SHA-256 TimeStampReq committing to the root', () => {
    const der = buildTimeStampRequest(rootHex);
    const req = AsnConvert.parse(der, TimeStampReq);

    expect(req.messageImprint.hashAlgorithm.algorithm).toBe(SHA256_OID);
    expect(octetToHex(req.messageImprint.hashedMessage)).toBe(rootHex);
    expect(req.certReq).toBe(true);
  });

  it('parses a granted response into token, serial and genTime', () => {
    const genTime = new Date('2026-03-03T12:00:00Z');
    const der = grantedResponse({ rootHex, serialHex: '2a', genTime });

    const parsed = parseTimeStampResponse(der);

    expect(parsed.serial).toBe('2a');
    expect(parsed.genTime.getTime()).toBe(genTime.getTime());
    expect(Buffer.from(parsed.tokenB64, 'base64').byteLength).toBeGreaterThan(
      0,
    );
  });

  it('throws when the TSA did not grant the request', () => {
    const resp = new TimeStampResp({
      status: new PKIStatusInfo({ status: PKIStatus.rejection }),
    });

    expect(() => parseTimeStampResponse(AsnConvert.serialize(resp))).toThrow(
      /did not grant/i,
    );
  });

  it('throws when a granted response carries no token', () => {
    const resp = new TimeStampResp({
      status: new PKIStatusInfo({ status: PKIStatus.granted }),
    });

    expect(() => parseTimeStampResponse(AsnConvert.serialize(resp))).toThrow(
      /no timeStampToken/i,
    );
  });
});
