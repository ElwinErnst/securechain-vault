import {
  AuditEventFields,
  computeChainHash,
  computeEventHash,
} from '../../common/utils/audit-canonical.util';

/**
 * A stored audit row as far as chain verification is concerned: the canonical
 * event fields plus the three persisted hashes.
 */
export type ChainRow = AuditEventFields & {
  prevHash: string | null;
  eventHash: string;
  chainHash: string;
};

export type ChainBreakReason =
  | 'BAD_GENESIS' // first row of the scope is not seq=1 / prevHash=null (front truncation)
  | 'SEQ_GAP' // a row is missing in the middle (interior deletion)
  | 'PREV_HASH_MISMATCH' // link does not point at the previous row's chainHash
  | 'EVENT_HASH_MISMATCH' // row contents were altered (recomputed eventHash differs)
  | 'CHAIN_HASH_MISMATCH'; // stored chainHash is inconsistent with prevHash|eventHash

export type ChainBreak = {
  seq: string;
  reason: ChainBreakReason;
  detail: string;
};

export type ChainVerifyStatus = 'VALID' | 'BROKEN' | 'EMPTY';

export type ChainVerifyResult = {
  scope: string;
  status: ChainVerifyStatus;
  /** Rows verified before stopping (all rows when VALID). */
  checked: number;
  /** seq of the last verified row — the chain head. */
  headSeq: string | null;
  /** chainHash of the last verified row — the value a checkpoint would sign. */
  headHash: string | null;
  /** First inconsistency found, or null when the chain verifies. */
  firstBreak: ChainBreak | null;
};

/**
 * Running state of a chain walk. Kept separate from IO so the walk can be fed
 * one paginated batch at a time (see AuditVerifierService) without loading the
 * whole scope into memory.
 */
export type ChainState = {
  checked: number;
  prevChainHash: string | null;
  headSeq: string | null;
  expectedSeq: bigint;
};

export function initialChainState(): ChainState {
  return { checked: 0, prevChainHash: null, headSeq: null, expectedSeq: 1n };
}

type StepOk = { ok: true; state: ChainState };
type StepFail = { ok: false; firstBreak: ChainBreak };

function fail(seq: string, reason: ChainBreakReason, detail: string): StepFail {
  return { ok: false, firstBreak: { seq, reason, detail } };
}

/**
 * Verify a single row against the running state. Rows MUST arrive in ascending
 * seq order. Returns the advanced state, or the first break found.
 *
 * IMPORTANT — what this cannot detect: deletion of the newest suffix. Removing
 * the most recent rows leaves a shorter but internally consistent chain, so it
 * verifies as VALID. Detecting suffix truncation requires an external anchored
 * checkpoint of {scope, seq, headHash}; the internal chain alone cannot.
 */
export function stepChain(state: ChainState, row: ChainRow): StepOk | StepFail {
  const isGenesis = state.checked === 0;

  if (isGenesis) {
    if (row.seq !== '1' || row.prevHash !== null) {
      return fail(
        row.seq,
        'BAD_GENESIS',
        `first row of scope must have seq=1 and prevHash=null; got seq=${row.seq}, prevHash=${row.prevHash ?? 'null'}`,
      );
    }
  } else {
    if (row.seq !== state.expectedSeq.toString()) {
      return fail(
        row.seq,
        'SEQ_GAP',
        `expected seq=${state.expectedSeq.toString()}, got seq=${row.seq}`,
      );
    }
    if (row.prevHash !== state.prevChainHash) {
      return fail(
        row.seq,
        'PREV_HASH_MISMATCH',
        `prevHash does not match the previous row's chainHash`,
      );
    }
  }

  const eventHash = computeEventHash(row);
  if (eventHash !== row.eventHash) {
    return fail(
      row.seq,
      'EVENT_HASH_MISMATCH',
      `row contents were altered: recomputed eventHash differs from stored`,
    );
  }

  const chainHash = computeChainHash(row.prevHash, eventHash);
  if (chainHash !== row.chainHash) {
    return fail(
      row.seq,
      'CHAIN_HASH_MISMATCH',
      `stored chainHash is inconsistent with prevHash|eventHash`,
    );
  }

  return {
    ok: true,
    state: {
      checked: state.checked + 1,
      prevChainHash: row.chainHash,
      headSeq: row.seq,
      expectedSeq: BigInt(row.seq) + 1n,
    },
  };
}

/**
 * Verify an in-memory array of rows (ascending seq). Convenience wrapper over
 * stepChain for small scopes and unit tests. Large scopes should stream batches
 * through stepChain instead.
 */
export function verifyChainRows(scope: string, rows: ChainRow[]): ChainVerifyResult {
  let state = initialChainState();

  for (const row of rows) {
    const res = stepChain(state, row);
    if (!res.ok) {
      return {
        scope,
        status: 'BROKEN',
        checked: state.checked,
        headSeq: state.headSeq,
        headHash: state.prevChainHash,
        firstBreak: res.firstBreak,
      };
    }
    state = res.state;
  }

  if (state.checked === 0) {
    return {
      scope,
      status: 'EMPTY',
      checked: 0,
      headSeq: null,
      headHash: null,
      firstBreak: null,
    };
  }

  return {
    scope,
    status: 'VALID',
    checked: state.checked,
    headSeq: state.headSeq,
    headHash: state.prevChainHash,
    firstBreak: null,
  };
}
