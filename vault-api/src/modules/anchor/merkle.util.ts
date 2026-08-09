import { createHash } from 'crypto';

/**
 * Binary Merkle tree over SHA-256, following RFC 6962 conventions:
 *
 * - Domain separation: leaves are hashed with a 0x00 prefix and internal nodes
 *   with a 0x01 prefix. Without this an attacker could present an internal node
 *   as a leaf (a second-preimage attack) and forge an inclusion proof.
 * - Lone nodes are promoted to the next level unchanged (they are NOT duplicated
 *   as in Bitcoin's tree, which is vulnerable to CVE-2012-2459 duplicate-hash
 *   ambiguity).
 *
 * All hashes are lowercase hex strings of 32-byte SHA-256 digests. Leaf inputs
 * are themselves hex strings (e.g. a document's sha256), so a leaf commits to
 * the raw 32 bytes, not to their hex text.
 */

const LEAF_PREFIX = Buffer.from([0x00]);
const NODE_PREFIX = Buffer.from([0x01]);

export type ProofStep = {
  hash: string;
  /** Side of the tree the sibling hash sits on, relative to the running node. */
  position: 'left' | 'right';
};

export type MerkleTree = {
  /** Root hash (hex) that a checkpoint anchors. */
  root: string;
  leafCount: number;
  /** Inclusion proof for the leaf at `index` (0-based, in insertion order). */
  proofFor: (index: number) => ProofStep[];
};

function sha256(buf: Buffer): string {
  return createHash('sha256').update(buf).digest('hex');
}

/** Domain-separated hash of a leaf whose value is a 32-byte hex string. */
export function leafHash(leafHex: string): string {
  return sha256(Buffer.concat([LEAF_PREFIX, Buffer.from(leafHex, 'hex')]));
}

/** Domain-separated hash of an internal node from its two child hashes (hex). */
function nodeHash(leftHex: string, rightHex: string): string {
  return sha256(
    Buffer.concat([
      NODE_PREFIX,
      Buffer.from(leftHex, 'hex'),
      Buffer.from(rightHex, 'hex'),
    ]),
  );
}

/**
 * Build a Merkle tree over the given leaf values (each a 32-byte hex string).
 * Throws on an empty input: an empty batch has no root worth anchoring.
 */
export function buildMerkleTree(leaves: readonly string[]): MerkleTree {
  if (leaves.length === 0) {
    throw new Error('Merkle tree requires at least one leaf');
  }

  const levels: string[][] = [leaves.map(leafHash)];

  while (levels[levels.length - 1].length > 1) {
    const prev = levels[levels.length - 1];
    const next: string[] = [];

    for (let i = 0; i < prev.length; i += 2) {
      const left = prev[i];
      const right = i + 1 < prev.length ? prev[i + 1] : null;
      // Promote a lone node unchanged (RFC 6962) instead of duplicating it.
      next.push(right === null ? left : nodeHash(left, right));
    }

    levels.push(next);
  }

  const root = levels[levels.length - 1][0];

  const proofFor = (index: number): ProofStep[] => {
    if (index < 0 || index >= leaves.length) {
      throw new RangeError(`Leaf index ${index} out of range`);
    }

    const steps: ProofStep[] = [];
    let idx = index;

    for (let level = 0; level < levels.length - 1; level++) {
      const nodes = levels[level];
      const isRightChild = idx % 2 === 1;
      const siblingIdx = isRightChild ? idx - 1 : idx + 1;

      // A lone node has no sibling at this level; it simply moves up unchanged.
      if (siblingIdx < nodes.length) {
        steps.push({
          hash: nodes[siblingIdx],
          position: isRightChild ? 'left' : 'right',
        });
      }

      idx = Math.floor(idx / 2);
    }

    return steps;
  };

  return { root, leafCount: leaves.length, proofFor };
}

/**
 * Recompute the root from a leaf value and its inclusion proof, and compare it
 * to the expected root. This is what verification runs against an anchored root.
 */
export function verifyMerkleProof(
  leafHex: string,
  proof: readonly ProofStep[],
  expectedRoot: string,
): boolean {
  let acc = leafHash(leafHex);

  for (const step of proof) {
    acc =
      step.position === 'left'
        ? nodeHash(step.hash, acc)
        : nodeHash(acc, step.hash);
  }

  return acc === expectedRoot;
}
