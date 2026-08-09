import { randomFillSync } from 'crypto';

import { AsnConvert, OctetString } from '@peculiar/asn1-schema';
import { AlgorithmIdentifier } from '@peculiar/asn1-x509';
import { ContentInfo, SignedData } from '@peculiar/asn1-cms';
import {
  MessageImprint,
  PKIStatus,
  TimeStampReq,
  TimeStampReqVersion,
  TimeStampResp,
  TSTInfo,
} from '@peculiar/asn1-tsp';

/** OID for SHA-256 (RFC 3161 messageImprint hash algorithm). */
const SHA256_OID = '2.16.840.1.101.3.4.2.1';

export type ParsedTimestamp = {
  /** The RFC 3161 timeStampToken (ContentInfo/SignedData), DER base64. */
  tokenB64: string;
  /** TSA-assigned serial number, hex. */
  serial: string;
  /** Time the TSA attests (TSTInfo.genTime). */
  genTime: Date;
};

/**
 * Build a DER-encoded RFC 3161 TimeStampReq over a Merkle root. The root is the
 * hashed message (it is already a SHA-256 digest), so the imprint algorithm is
 * SHA-256. `certReq` asks the TSA to include its certificate so the token can be
 * verified later. A random nonce guards against response replay.
 */
export function buildTimeStampRequest(rootHex: string): ArrayBuffer {
  const nonce = new Uint8Array(8);
  randomFillSync(nonce);
  // Keep the high bit clear so the nonce encodes as a positive INTEGER.
  nonce[0] &= 0x7f;

  const req = new TimeStampReq({
    version: TimeStampReqVersion.v1,
    messageImprint: new MessageImprint({
      hashAlgorithm: new AlgorithmIdentifier({
        algorithm: SHA256_OID,
        parameters: null,
      }),
      hashedMessage: new OctetString(Buffer.from(rootHex, 'hex')),
    }),
    certReq: true,
    nonce: nonce.buffer,
  });

  return AsnConvert.serialize(req);
}

function toArrayBuffer(view: ArrayBufferView): ArrayBuffer {
  return view.buffer.slice(
    view.byteOffset,
    view.byteOffset + view.byteLength,
  ) as ArrayBuffer;
}

/**
 * Parse a DER-encoded RFC 3161 TimeStampResp: assert the TSA granted the
 * request, then extract the token plus the serial and genTime from its TSTInfo.
 * Throws when the request was not granted or the token is missing/malformed.
 */
export function parseTimeStampResponse(der: BufferSource): ParsedTimestamp {
  const resp = AsnConvert.parse(der, TimeStampResp);

  const status = resp.status.status;
  if (status !== PKIStatus.granted && status !== PKIStatus.grantedWithMods) {
    const text = resp.status.statusString?.join('; ') ?? '';
    throw new Error(
      `TSA did not grant the request (status=${status}) ${text}`.trim(),
    );
  }

  const token = resp.timeStampToken;
  if (!token) {
    throw new Error('TSA response granted but carried no timeStampToken');
  }

  const tstInfo = extractTstInfo(token);

  return {
    tokenB64: Buffer.from(AsnConvert.serialize(token)).toString('base64'),
    serial: Buffer.from(tstInfo.serialNumber).toString('hex'),
    genTime: tstInfo.genTime,
  };
}

/** Unwrap ContentInfo -> SignedData -> eContent (OCTET STRING) -> TSTInfo. */
function extractTstInfo(token: ContentInfo): TSTInfo {
  const signedData = AsnConvert.parse(token.content, SignedData);
  const eContent = signedData.encapContentInfo.eContent;

  if (!eContent) {
    throw new Error('timeStampToken has no encapsulated content');
  }

  const tstBytes = eContent.single
    ? toArrayBuffer(eContent.single)
    : eContent.any;

  if (!tstBytes) {
    throw new Error('timeStampToken eContent is empty');
  }

  return AsnConvert.parse(tstBytes, TSTInfo);
}
