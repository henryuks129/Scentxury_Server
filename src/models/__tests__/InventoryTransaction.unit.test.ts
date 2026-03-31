/**
 * InventoryTransaction Model — Unit Tests
 *
 * MongoDB lifecycle is managed by the global vitest setup file
 * (src/test/setup.ts) — do NOT create a local MongoMemoryServer here,
 * as singleFork mode shares one Mongoose connection across all test files.
 *
 * @file src/models/__tests__/InventoryTransaction.unit.test.ts
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { Types } from 'mongoose';
import { InventoryTransaction } from '../InventoryTransaction.js';

// Clear before each test so tests don't bleed into each other
beforeEach(async () => {
  await InventoryTransaction.deleteMany({});
});

const productId = new Types.ObjectId();
const adminId = new Types.ObjectId();

function validTransaction(overrides = {}) {
  return {
    productId,
    variantSku: 'OUD-50ML-001',
    transactionType: 'add',
    quantityChanged: 50,
    beforeStock: 10,
    afterStock: 60,
    reason: 'Restocking from supplier',
    createdBy: adminId,
    ...overrides,
  };
}

describe('InventoryTransaction Model', () => {
  describe('creation', () => {
    it('should create a transaction with valid data', async () => {
      const tx = await InventoryTransaction.create(validTransaction());

      expect(tx._id).toBeDefined();
      expect(tx.productId.toString()).toBe(productId.toString());
      expect(tx.variantSku).toBe('OUD-50ML-001');
      expect(tx.transactionType).toBe('add');
      expect(tx.quantityChanged).toBe(50);
    });

    it('should auto-set timestamp on creation', async () => {
      const tx = await InventoryTransaction.create(validTransaction());
      expect(tx.timestamp).toBeInstanceOf(Date);
    });

    it('should set timestamps (createdAt, updatedAt)', async () => {
      const tx = await InventoryTransaction.create(validTransaction());
      expect(tx.createdAt).toBeInstanceOf(Date);
      expect(tx.updatedAt).toBeInstanceOf(Date);
    });
  });

  describe('validation', () => {
    it('should reject missing productId', async () => {
      const { productId: _p, ...data } = validTransaction() as any;
      await expect(InventoryTransaction.create(data)).rejects.toThrow();
    });

    it('should reject missing variantSku', async () => {
      const { variantSku: _s, ...data } = validTransaction() as any;
      await expect(InventoryTransaction.create(data)).rejects.toThrow();
    });

    it('should reject invalid transactionType', async () => {
      await expect(
        InventoryTransaction.create(validTransaction({ transactionType: 'sell' }))
      ).rejects.toThrow();
    });

    it('should accept all valid transaction types', async () => {
      const types = ['add', 'remove', 'return', 'damage', 'adjustment'];

      for (const transactionType of types) {
        const tx = await InventoryTransaction.create(validTransaction({ transactionType }));
        expect(tx.transactionType).toBe(transactionType);
        await InventoryTransaction.deleteOne({ _id: tx._id });
      }
    });

    it('should reject negative beforeStock', async () => {
      await expect(
        InventoryTransaction.create(validTransaction({ beforeStock: -1 }))
      ).rejects.toThrow();
    });

    it('should reject negative afterStock', async () => {
      await expect(
        InventoryTransaction.create(validTransaction({ afterStock: -5 }))
      ).rejects.toThrow();
    });

    it('should allow negative quantityChanged for removal transactions', async () => {
      const tx = await InventoryTransaction.create(
        validTransaction({
          transactionType: 'remove',
          quantityChanged: -10,
          beforeStock: 60,
          afterStock: 50,
        })
      );
      expect(tx.quantityChanged).toBe(-10);
    });
  });

  describe('queries', () => {
    it('should find transactions by productId', async () => {
      const otherId = new Types.ObjectId();
      await InventoryTransaction.create(validTransaction());
      await InventoryTransaction.create(validTransaction({ productId: otherId }));

      const results = await InventoryTransaction.find({ productId });
      expect(results).toHaveLength(1);
    });

    it('should find transactions by variantSku', async () => {
      await InventoryTransaction.create(validTransaction({ variantSku: 'OUD-50ML-001' }));
      await InventoryTransaction.create(validTransaction({ variantSku: 'ROSE-100ML-002' }));

      const results = await InventoryTransaction.find({ variantSku: 'OUD-50ML-001' });
      expect(results).toHaveLength(1);
    });

    it('should sort by timestamp descending', async () => {
      await InventoryTransaction.create(validTransaction({ timestamp: new Date('2025-01-10') }));
      await InventoryTransaction.create(validTransaction({ timestamp: new Date('2025-01-20') }));

      const results = await InventoryTransaction.find({ productId }).sort({ timestamp: -1 });
      expect(results[0].timestamp.getTime()).toBeGreaterThan(results[1].timestamp.getTime());
    });
  });
});
