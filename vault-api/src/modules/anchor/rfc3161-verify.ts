import { webcrypto } from 'crypto';

import * as pkijs from 'pkijs';
import { AsnConvert } from '@peculiar/asn1-schema';
import { ContentInfo, SignedData } from '@peculiar/asn1-cms';
import { TSTInfo } from '@peculiar/asn1-tsp';

import type {
  TimestampVerifierPort,
  TokenVerification,
} from './ports/timestamp-verifier.port';

// pkijs needs a crypto engine. Node's WebCrypto provides one.
pkijs.setEngine(
  'sytadel-anchor',
  new pkijs.CryptoEngine({
    name: 'sytadel-anchor',
    crypto: webcrypto as unknown as Crypto,
  }),
);

/** CMS id-data content type — a neutral label for generic signature verification. */
const ID_DATA = '1.2.840.113549.1.7.1';

function toArrayBuffer(view: ArrayBufferView): ArrayBuffer {
  return view.buffer.slice(
    view.byteOffset,
    view.byteOffset + view.byteLength,
  ) as ArrayBuffer;
}

type ParsedToken = {
  /** DER of the TSTInfo (the eContent the SignerInfo signs over). */
  tstBytes: ArrayBuffer;
  /** The imprint the TSA attested, i.e. what root the token commits to. */
  imprintHex: string;
};

function parseToken(tokenDer: ArrayBuffer): ParsedToken {
  const contentInfo = AsnConvert.parse(tokenDer, ContentInfo);
  const signedData = AsnConvert.parse(contentInfo.content, SignedData);
  const eContent = signedData.encapContentInfo.eContent;

  const tstBytes = eContent?.single
    ? toArrayBuffer(eContent.single)
    : eContent?.any;
  if (!tstBytes) {
    throw new Error('token has no TSTInfo content');
  }

  const tst = AsnConvert.parse(tstBytes, TSTInfo);
  const hm = tst.messageImprint.hashedMessage;
  return {
    tstBytes,
    imprintHex: Buffer.from(hm.buffer, hm.byteOffset, hm.byteLength).toString(
      'hex',
    ),
  };
}

/**
 * Verify a stored RFC 3161 token against an expected Merkle root:
 *  1. the token's messageImprint must equal the root (the token is for THIS root);
 *  2. the CMS SignerInfo signature must verify against the embedded TSA cert
 *     (the token is genuine, not forged).
 *
 * Trust-chain validation (does the TSA cert chain to a trusted CA?) is out of
 * scope here and left as a follow-up.
 */
export async function verifyTimestampToken(
  tokenB64: string,
  expectedRootHex: string,
): Promise<TokenVerification> {
  const tokenDer = toArrayBuffer(Buffer.from(tokenB64, 'base64'));

  let parsed: ParsedToken;
  try {
    parsed = parseToken(tokenDer);
  } catch (err: unknown) {
    return {
      valid: false,
      reason: `malformed timestamp token: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  if (parsed.imprintHex !== expectedRootHex) {
    return {
      valid: false,
      reason: 'token messageImprint does not match the anchored root',
    };
  }

  try {
    const contentInfo = pkijs.ContentInfo.fromBER(tokenDer);
    const signedData = new pkijs.SignedData({ schema: contentInfo.content });

    // pkijs's TSTInfo-aware path insists on hashing caller-supplied data and
    // matching it to the imprint — but our imprint IS a Merkle root, not the
    // hash of a blob we hold. We already checked the imprint above, so relabel
    // the content type to id-data and let pkijs verify the CMS signature over
    // the attached eContent generically. This changes control flow only, not
    // the cryptographic inputs (signedAttrs, eContent, signature).
    signedData.encapContentInfo.eContentType = ID_DATA;

    const result = await signedData.verify({
      signer: 0,
      checkChain: false,
      extendedMode: true,
    });

    if (result.signatureVerified !== true) {
      return { valid: false, reason: 'token signature did not verify' };
    }
  } catch (err: unknown) {
    return {
      valid: false,
      reason: `token signature verification error: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  return { valid: true, reason: null };
}

/** Concrete verifier used in production (DI). */
export class Rfc3161TimestampVerifier implements TimestampVerifierPort {
  verifyToken(tokenB64: string, rootHex: string): Promise<TokenVerification> {
    return verifyTimestampToken(tokenB64, rootHex);
  }
}
