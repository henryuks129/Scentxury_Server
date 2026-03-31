/**
 * ============================================
 * REFERRAL MODEL - UNIT TESTS
 * ============================================
 *
 * Comprehensive tests for Referral model schema validation,
 * methods, and business logic.
 *
 * @file src/models/__tests__/Referral.unit.test.ts
 */

import { describe, it, expect } from 'vitest';
import mongoose from 'mongoose';
import { Referral, IReferral, ReferralStatus, RewardType } from '../Referral.js';

describe('Referral Model', () => {
  // Helper to create valid referral data
  const createValidReferral = (overrides = {}) => ({
    referrerId: new mongoose.Types.ObjectId(),
    referredUserId: new mongoose.Types.ObjectId(),
    referralCode: `CHI-${Math.random().toString(36).substr(2, 6).toUpperCase()}`,
    rewardAmount: 5000,
    expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days from now
    ...overrides,
  });

  // ========================================
  // SCHEMA VALIDATION
  // ========================================
  describe('Schema Validation', () => {
    it('should create valid referral with required fields', async () => {
      const referral = new Referral(createValidReferral());
      const error = referral.validateSync();
      expect(error).toBeUndefined();
    });

    it('should require referrerId', () => {
      const referral = new Referral(createValidReferral({ referrerId: undefined }));
      const error = referral.validateSync();
      expect(error?.errors['referrerId']).toBeDefined();
    });

    it('should require referredUserId', () => {
      const referral = new Referral(createValidReferral({ referredUserId: undefined }));
      const error = referral.validateSync();
      expect(error?.errors['referredUserId']).toBeDefined();
    });

    it('should require referralCode', () => {
      const referral = new Referral(createValidReferral({ referralCode: undefined }));
      const error = referral.validateSync();
      expect(error?.errors['referralCode']).toBeDefined();
    });

    it('should require rewardAmount', () => {
      const referral = new Referral(createValidReferral({ rewardAmount: undefined }));
      const error = referral.validateSync();
      expect(error?.errors['rewardAmount']).toBeDefined();
    });

    it('should require expiresAt', () => {
      const referral = new Referral(createValidReferral({ expiresAt: undefined }));
      const error = referral.validateSync();
      expect(error?.errors['expiresAt']).toBeDefined();
    });

    it('should default status to pending', () => {
      const referral = new Referral(createValidReferral());
      expect(referral.status).toBe('pending');
    });

    it('should default rewardCurrency to NGN', () => {
      const referral = new Referral(createValidReferral());
      expect(referral.rewardCurrency).toBe('NGN');
    });

    it('should default rewardType to credit', () => {
      const referral = new Referral(createValidReferral());
      expect(referral.rewardType).toBe('credit');
    });
  });

  // ========================================
  // REFERRAL STATUS
  // ========================================
  describe('Referral Status', () => {
    const validStatuses: ReferralStatus[] = ['pending', 'qualified', 'rewarded', 'expired'];

    validStatuses.forEach((status) => {
      it(`should accept status: ${status}`, () => {
        const referral = new Referral(createValidReferral({ status }));
        const error = referral.validateSync();
        expect(error?.errors['status']).toBeUndefined();
        expect(referral.status).toBe(status);
      });
    });

    it('should reject invalid status', () => {
      const referral = new Referral(createValidReferral({ status: 'invalid' }));
      const error = referral.validateSync();
      expect(error?.errors['status']).toBeDefined();
    });
  });

  // ========================================
  // REWARD TYPE
  // ========================================
  describe('Reward Type', () => {
    const validTypes: RewardType[] = ['discount', 'credit', 'product'];

    validTypes.forEach((type) => {
      it(`should accept rewardType: ${type}`, () => {
        const referral = new Referral(createValidReferral({ rewardType: type }));
        const error = referral.validateSync();
        expect(error?.errors['rewardType']).toBeUndefined();
      });
    });

    it('should reject invalid rewardType', () => {
      const referral = new Referral(createValidReferral({ rewardType: 'cash' }));
      const error = referral.validateSync();
      expect(error?.errors['rewardType']).toBeDefined();
    });
  });

  // ========================================
  // REWARD CURRENCY
  // ========================================
  describe('Reward Currency', () => {
    it('should accept NGN currency', () => {
      const referral = new Referral(createValidReferral({ rewardCurrency: 'NGN' }));
      expect(referral.rewardCurrency).toBe('NGN');
    });

    it('should accept USD currency', () => {
      const referral = new Referral(createValidReferral({ rewardCurrency: 'USD' }));
      expect(referral.rewardCurrency).toBe('USD');
    });

    it('should reject invalid currency', () => {
      const referral = new Referral(createValidReferral({ rewardCurrency: 'EUR' }));
      const error = referral.validateSync();
      expect(error?.errors['rewardCurrency']).toBeDefined();
    });
  });

  // ========================================
  // REWARD AMOUNT
  // ========================================
  describe('Reward Amount', () => {
    it('should accept positive reward amount', () => {
      const referral = new Referral(createValidReferral({ rewardAmount: 10000 }));
      const error = referral.validateSync();
      expect(error).toBeUndefined();
      expect(referral.rewardAmount).toBe(10000);
    });

    it('should accept zero reward amount', () => {
      const referral = new Referral(createValidReferral({ rewardAmount: 0 }));
      const error = referral.validateSync();
      expect(error).toBeUndefined();
    });

    it('should reject negative reward amount', () => {
      const referral = new Referral(createValidReferral({ rewardAmount: -1000 }));
      const error = referral.validateSync();
      expect(error?.errors['rewardAmount']).toBeDefined();
    });
  });

  // ========================================
  // OPTIONAL FIELDS
  // ========================================
  describe('Optional Fields', () => {
    it('should store rewardProductId for product rewards', () => {
      const productId = new mongoose.Types.ObjectId();
      const referral = new Referral(
        createValidReferral({
          rewardType: 'product',
          rewardProductId: productId,
        })
      );
      expect(referral.rewardProductId?.toString()).toBe(productId.toString());
    });

    it('should store qualifyingOrderId', () => {
      const orderId = new mongoose.Types.ObjectId();
      const referral = new Referral(
        createValidReferral({
          qualifyingOrderId: orderId,
        })
      );
      expect(referral.qualifyingOrderId?.toString()).toBe(orderId.toString());
    });

    it('should store qualifiedAt date', () => {
      const qualifiedDate = new Date();
      const referral = new Referral(
        createValidReferral({
          qualifiedAt: qualifiedDate,
        })
      );
      expect(referral.qualifiedAt).toEqual(qualifiedDate);
    });

    it('should store rewardedAt date', () => {
      const rewardedDate = new Date();
      const referral = new Referral(
        createValidReferral({
          rewardedAt: rewardedDate,
        })
      );
      expect(referral.rewardedAt).toEqual(rewardedDate);
    });

    it('should store notes', () => {
      const referral = new Referral(
        createValidReferral({
          notes: 'VIP customer referral',
        })
      );
      expect(referral.notes).toBe('VIP customer referral');
    });
  });

  // ========================================
  // METHODS
  // ========================================
  describe('Methods', () => {
    describe('isExpired', () => {
      it('should return false for future expiration', async () => {
        const referral = await Referral.create(createValidReferral());
        expect(referral.isExpired()).toBe(false);
      });

      it('should return true for past expiration', async () => {
        const referral = await Referral.create(
          createValidReferral({
            expiresAt: new Date(Date.now() - 1000), // 1 second ago
          })
        );
        expect(referral.isExpired()).toBe(true);
      });

      it('should return true for exactly now', async () => {
        const referral = await Referral.create(
          createValidReferral({
            expiresAt: new Date(Date.now() - 1), // Just passed
          })
        );
        expect(referral.isExpired()).toBe(true);
      });
    });

    describe('canQualify', () => {
      it('should return true for pending non-expired referral', async () => {
        const referral = await Referral.create(createValidReferral());
        expect(referral.canQualify()).toBe(true);
      });

      it('should return false for expired referral', async () => {
        const referral = await Referral.create(
          createValidReferral({
            expiresAt: new Date(Date.now() - 1000),
          })
        );
        expect(referral.canQualify()).toBe(false);
      });

      it('should return false for qualified referral', async () => {
        const referral = await Referral.create(
          createValidReferral({
            status: 'qualified',
          })
        );
        expect(referral.canQualify()).toBe(false);
      });

      it('should return false for rewarded referral', async () => {
        const referral = await Referral.create(
          createValidReferral({
            status: 'rewarded',
          })
        );
        expect(referral.canQualify()).toBe(false);
      });

      it('should return false for expired status referral', async () => {
        const referral = await Referral.create(
          createValidReferral({
            status: 'expired',
          })
        );
        expect(referral.canQualify()).toBe(false);
      });
    });

    describe('qualify', () => {
      it('should qualify pending referral', async () => {
        const referral = await Referral.create(createValidReferral());
        const orderId = new mongoose.Types.ObjectId();

        referral.qualify(orderId);

        expect(referral.status).toBe('qualified');
        expect(referral.qualifyingOrderId?.toString()).toBe(orderId.toString());
        expect(referral.qualifiedAt).toBeDefined();
      });

      it('should throw error for expired referral', async () => {
        const referral = await Referral.create(
          createValidReferral({
            expiresAt: new Date(Date.now() - 1000),
          })
        );
        const orderId = new mongoose.Types.ObjectId();

        expect(() => referral.qualify(orderId)).toThrow('Referral cannot be qualified');
      });

      it('should throw error for already qualified referral', async () => {
        const referral = await Referral.create(
          createValidReferral({
            status: 'qualified',
          })
        );
        const orderId = new mongoose.Types.ObjectId();

        expect(() => referral.qualify(orderId)).toThrow('Referral cannot be qualified');
      });
    });
  });

  // ========================================
  // PRE-SAVE HOOKS
  // ========================================
  describe('Pre-save Hooks', () => {
    it('should auto-expire pending referrals past expiration', async () => {
      const referral = new Referral(
        createValidReferral({
          status: 'pending',
          expiresAt: new Date(Date.now() - 1000), // Already expired
        })
      );

      await referral.save();

      expect(referral.status).toBe('expired');
    });

    it('should not auto-expire non-pending referrals', async () => {
      const referral = new Referral(
        createValidReferral({
          status: 'qualified',
          expiresAt: new Date(Date.now() - 1000),
        })
      );

      await referral.save();

      expect(referral.status).toBe('qualified');
    });

    it('should not expire pending referrals with future expiration', async () => {
      const referral = await Referral.create(createValidReferral());
      expect(referral.status).toBe('pending');
    });
  });

  // ========================================
  // TIMESTAMPS
  // ========================================
  describe('Timestamps', () => {
    it('should set createdAt on creation', async () => {
      const beforeCreate = new Date();
      const referral = await Referral.create(createValidReferral());
      expect(referral.createdAt).toBeDefined();
      expect(referral.createdAt.getTime()).toBeGreaterThanOrEqual(beforeCreate.getTime());
    });

    it('should set updatedAt on creation', async () => {
      const referral = await Referral.create(createValidReferral());
      expect(referral.updatedAt).toBeDefined();
    });

    it('should update updatedAt on save', async () => {
      const referral = await Referral.create(createValidReferral());
      const originalUpdatedAt = referral.updatedAt;

      await new Promise((resolve) => setTimeout(resolve, 10));
      referral.notes = 'Updated note';
      await referral.save();

      expect(referral.updatedAt.getTime()).toBeGreaterThan(originalUpdatedAt.getTime());
    });
  });

  // ========================================
  // INDEXES
  // ========================================
  describe('Indexes', () => {
    it('should have referrerId index', () => {
      const indexes = Referral.schema.indexes();
      const referrerIdIndex = indexes.find(
        ([fields]) => Object.keys(fields).includes('referrerId')
      );
      expect(referrerIdIndex).toBeDefined();
    });

    it('should have referredUserId index', () => {
      const indexes = Referral.schema.indexes();
      const referredUserIdIndex = indexes.find(
        ([fields]) => Object.keys(fields).includes('referredUserId')
      );
      expect(referredUserIdIndex).toBeDefined();
    });

    it('should have status index', () => {
      const indexes = Referral.schema.indexes();
      const statusIndex = indexes.find(
        ([fields]) => Object.keys(fields).includes('status')
      );
      expect(statusIndex).toBeDefined();
    });

    it('should have expiresAt index', () => {
      const indexes = Referral.schema.indexes();
      const expiresAtIndex = indexes.find(
        ([fields]) => Object.keys(fields).includes('expiresAt')
      );
      expect(expiresAtIndex).toBeDefined();
    });

    it('should enforce unique referredUserId', async () => {
      const referredUserId = new mongoose.Types.ObjectId();
      await Referral.create(createValidReferral({ referredUserId }));

      await expect(
        Referral.create(createValidReferral({ referredUserId }))
      ).rejects.toThrow();
    });
  });

  // ========================================
  // DATABASE OPERATIONS
  // ========================================
  describe('Database Operations', () => {
    it('should create and find referral', async () => {
      const referral = await Referral.create(createValidReferral());
      const found = await Referral.findById(referral._id);
      expect(found).not.toBeNull();
      expect(found?.referralCode).toBe(referral.referralCode);
    });

    it('should find referrals by referrerId', async () => {
      const referrerId = new mongoose.Types.ObjectId();
      await Referral.create([
        createValidReferral({ referrerId }),
        createValidReferral({ referrerId }),
      ]);

      const referrals = await Referral.find({ referrerId });
      expect(referrals).toHaveLength(2);
    });

    it('should find referrals by status', async () => {
      const batchCode = `BATCH-${Date.now()}`;
      await Referral.create([
        createValidReferral({ referralCode: `${batchCode}-1`, status: 'pending' }),
        createValidReferral({ referralCode: `${batchCode}-2`, status: 'qualified' }),
        createValidReferral({ referralCode: `${batchCode}-3`, status: 'rewarded' }),
      ]);

      const pendingReferrals = await Referral.find({
        referralCode: { $regex: `^${batchCode}` },
        status: 'pending',
      });
      expect(pendingReferrals).toHaveLength(1);
    });

    it('should find by referralCode', async () => {
      const referralCode = `CHI-UNIQUE${Date.now()}`;
      await Referral.create(createValidReferral({ referralCode }));

      const found = await Referral.findOne({ referralCode });
      expect(found).not.toBeNull();
      expect(found?.referralCode).toBe(referralCode);
    });

    it('should find expiring referrals', async () => {
      const twoDaysFromNow = new Date();
      twoDaysFromNow.setDate(twoDaysFromNow.getDate() + 2);

      const sevenDaysFromNow = new Date();
      sevenDaysFromNow.setDate(sevenDaysFromNow.getDate() + 7);

      const batchCode = `EXP-${Date.now()}`;
      await Referral.create([
        createValidReferral({
          referralCode: `${batchCode}-1`,
          expiresAt: twoDaysFromNow,
        }),
        createValidReferral({
          referralCode: `${batchCode}-2`,
          expiresAt: sevenDaysFromNow,
        }),
      ]);

      const threeDaysFromNow = new Date();
      threeDaysFromNow.setDate(threeDaysFromNow.getDate() + 3);

      const expiringSoon = await Referral.find({
        referralCode: { $regex: `^${batchCode}` },
        status: 'pending',
        expiresAt: { $lte: threeDaysFromNow },
      });
      expect(expiringSoon).toHaveLength(1);
    });
  });
});
