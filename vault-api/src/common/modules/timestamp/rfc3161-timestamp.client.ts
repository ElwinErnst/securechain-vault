import { Logger } from '@nestjs/common';

import type {
  TimestampClientPort,
  TimestampResult,
} from './timestamp-client.port';
import { buildTimeStampRequest, parseTimeStampResponse } from './rfc3161';

/**
 * Real RFC 3161 timestamp client. Sends a TimeStampReq over a Merkle root to a
 * Timestamp Authority and returns the granted token plus its serial and genTime.
 * The token is stored so the TSA's signature over the root can be verified later.
 */
export class Rfc3161TimestampClient implements TimestampClientPort {
  private readonly logger = new Logger(Rfc3161TimestampClient.name);

  constructor(
    private readonly tsaUrl: string,
    private readonly timeoutMs = 10_000,
  ) {}

  async timestampRoot(rootHex: string): Promise<TimestampResult> {
    const request = buildTimeStampRequest(rootHex);

    const res = await fetch(this.tsaUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/timestamp-query',
        Accept: 'application/timestamp-reply',
      },
      body: request,
      signal: AbortSignal.timeout(this.timeoutMs),
    });

    if (!res.ok) {
      throw new Error(
        `TSA HTTP ${res.status} ${res.statusText} from ${this.tsaUrl}`,
      );
    }

    const parsed = parseTimeStampResponse(await res.arrayBuffer());

    this.logger.log(
      `Timestamped root via ${this.tsaUrl} (serial=${parsed.serial}, genTime=${parsed.genTime.toISOString()})`,
    );

    return {
      simulated: false,
      tokenB64: parsed.tokenB64,
      tsaUrl: this.tsaUrl,
      serial: parsed.serial,
      timestampedAt: parsed.genTime,
    };
  }
}
