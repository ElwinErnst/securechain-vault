import { createHash } from 'crypto';

import {
  buildMerkleTree,
  leafHash,
  verifyMerkleProof,
  type ProofStep,
} from './merkle.util';

/** A deterministic 32-byte hex leaf value derived from a label. */
function leaf(label: string): string {
  return createHash('sha256').update(label).digest('hex');
}

function leaves(n: number): string[] {
  return Array.from({ length: n }, (_, i) => leaf(`doc-${i}`));
}

describe('merkle.util', () => {
  it('rejects an empty batch (no root to anchor)', () => {
    expect(() => buildMerkleTree([])).toThrow(/at least one leaf/);
  });

  it('a single-leaf tree roots at that leaf hash with an empty proof', () => {
    const only = leaf('solo');
    const tree = buildMerkleTree([only]);

    expect(tree.leafCount).toBe(1);
    expect(tree.root).toBe(leafHash(only));
    expect(tree.proofFor(0)).toEqual([]);
    expect(verifyMerkleProof(only, tree.proofFor(0), tree.root)).toBe(true);
  });

  it('separates leaf and node domains (second-preimage resistance)', () => {
    // The hash of two children as an internal node must never equal the hash of
    // those same bytes treated as a leaf. Otherwise an internal node could be
    // replayed as a leaf and forge an inclusion proof.
    const [a, b] = [leaf('a'), leaf('b')];
    const tree = buildMerkleTree([a, b]);
    const concatAsLeaf = leafHash(tree.root);
    expect(tree.root).not.toBe(concatAsLeaf);
  });

  it('produces a valid inclusion proof for every leaf, at various sizes', () => {
    for (const size of [2, 3, 4, 5, 8, 9, 16, 17]) {
      const batch = leaves(size);
      const tree = buildMerkleTree(batch);
      expect(tree.leafCount).toBe(size);

      batch.forEach((value, index) => {
        const proof = tree.proofFor(index);
        expect(verifyMerkleProof(value, proof, tree.root)).toBe(true);
      });
    }
  });

  it('is deterministic and order-sensitive', () => {
    const batch = leaves(6);
    expect(buildMerkleTree(batch).root).toBe(buildMerkleTree(batch).root);

    const reordered = [...batch].reverse();
    expect(buildMerkleTree(reordered).root).not.toBe(
      buildMerkleTree(batch).root,
    );
  });

  it('fails verification when the leaf is tampered', () => {
    const batch = leaves(5);
    const tree = buildMerkleTree(batch);
    const proof = tree.proofFor(2);

    expect(verifyMerkleProof(leaf('forged'), proof, tree.root)).toBe(false);
  });

  it('fails verification when a proof step is tampered', () => {
    const batch = leaves(5);
    const tree = buildMerkleTree(batch);
    const proof = tree.proofFor(2);
    const tampered: ProofStep[] = proof.map((step, i) =>
      i === 0 ? { ...step, hash: leaf('evil') } : step,
    );

    expect(verifyMerkleProof(batch[2], tampered, tree.root)).toBe(false);
  });

  it('rejects a proof from one batch against another batch root', () => {
    const treeA = buildMerkleTree(leaves(4));
    const batchB = leaves(4).map((l) => leafHash(l)); // different values
    const treeB = buildMerkleTree(batchB);

    // A genuine proof from tree A must not verify against tree B's root.
    expect(verifyMerkleProof(leaves(4)[1], treeA.proofFor(1), treeB.root)).toBe(
      false,
    );
  });

  it('throws on an out-of-range leaf index', () => {
    const tree = buildMerkleTree(leaves(3));
    expect(() => tree.proofFor(3)).toThrow(RangeError);
    expect(() => tree.proofFor(-1)).toThrow(RangeError);
  });
});
