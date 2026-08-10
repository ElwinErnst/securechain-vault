import { webcrypto } from 'crypto';

import * as pkijs from 'pkijs';
import { AsnConvert } from '@peculiar/asn1-schema';
import { ContentInfo, SignedData } from '@peculiar/asn1-cms';
import { TSTInfo } from '@peculiar/asn1-tsp';

import type {
  TimestampVerifierPort,
  TokenVerification,
} from './timestamp-verifier.port';

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
/** id-kp-timeStamping — the EKU an RFC 3161 TSA signing certificate MUST carry. */
const EKU_TIMESTAMPING = '1.3.6.1.5.5.7.3.8';
/** Extended Key Usage extension OID. */
const EXT_KEY_USAGE = '2.5.29.37';

function toArrayBuffer(view: ArrayBufferView): ArrayBuffer {
  return view.buffer.slice(
    view.byteOffset,
    view.byteOffset + view.byteLength,
  ) as ArrayBuffer;
}

type ParsedToken = {
  /** The imprint the TSA attested, i.e. what root the token commits to. */
  imprintHex: string;
  /** The time the TSA attests — used as the chain-validation reference date. */
  genTime: Date;
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
    imprintHex: Buffer.from(hm.buffer, hm.byteOffset, hm.byteLength).toString(
      'hex',
    ),
    genTime: tst.genTime,
  };
}

/** Parse one or more PEM-encoded certificates. */
export function parsePemCertificates(pem: string): pkijs.Certificate[] {
  const blocks =
    pem.match(
      /-----BEGIN CERTIFICATE-----[\s\S]+?-----END CERTIFICATE-----/g,
    ) ?? [];
  return blocks.map((block) => {
    const b64 = block
      .replace(/-----(BEGIN|END) CERTIFICATE-----/g, '')
      .replace(/\s+/g, '');
    return pkijs.Certificate.fromBER(toArrayBuffer(Buffer.from(b64, 'base64')));
  });
}

function hasTimeStampingEku(
  cert: pkijs.Certificate | null | undefined,
): boolean {
  const ext = cert?.extensions?.find((e) => e.extnID === EXT_KEY_USAGE);
  const eku = ext?.parsedValue as pkijs.ExtKeyUsage | undefined;
  return Array.isArray(eku?.keyPurposes)
    ? eku.keyPurposes.includes(EKU_TIMESTAMPING)
    : false;
}

/**
 * Verify a stored RFC 3161 token against an expected Merkle root:
 *  1. the token's messageImprint must equal the root (the token is for THIS root);
 *  2. the CMS SignerInfo signature must verify against the signer certificate;
 *  3. the signer certificate must chain to a trusted TSA CA, be valid at genTime,
 *     and carry the timeStamping extended key usage.
 */
export async function verifyTimestampToken(
  tokenB64: string,
  expectedRootHex: string,
  trustedCerts: pkijs.Certificate[],
): Promise<TokenVerification> {
  if (trustedCerts.length === 0) {
    return {
      valid: false,
      reason: 'no trusted TSA CA configured for chain validation',
    };
  }

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
    // the content type to id-data and let pkijs verify the CMS signature and
    // certificate chain generically. This changes control flow only, not the
    // cryptographic inputs (signedAttrs, eContent, signature, certificates).
    signedData.encapContentInfo.eContentType = ID_DATA;

    // Chain is validated as of genTime (the relabel skips pkijs's own
    // TSTInfo checkDate handling, so pass it explicitly).
    const result = await signedData.verify({
      signer: 0,
      checkChain: true,
      trustedCerts,
      checkDate: parsed.genTime,
      extendedMode: true,
    });

    if (result.signatureVerified !== true) {
      return { valid: false, reason: 'token signature did not verify' };
    }

    if (!hasTimeStampingEku(result.signerCertificate)) {
      return {
        valid: false,
        reason: 'signer certificate lacks the timeStamping extended key usage',
      };
    }
  } catch (err: unknown) {
    return {
      valid: false,
      reason: `token verification failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  return { valid: true, reason: null };
}

/** Concrete verifier used in production (DI). */
export class Rfc3161TimestampVerifier implements TimestampVerifierPort {
  private readonly trustedCerts: pkijs.Certificate[];

  constructor(trustedCaPems: string[]) {
    this.trustedCerts = trustedCaPems.flatMap(parsePemCertificates);
  }

  verifyToken(tokenB64: string, rootHex: string): Promise<TokenVerification> {
    return verifyTimestampToken(tokenB64, rootHex, this.trustedCerts);
  }
}
