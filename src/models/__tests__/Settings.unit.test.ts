/**
 * ============================================
 * SETTINGS MODEL - UNIT TESTS
 * ============================================
 *
 * Comprehensive tests for Settings model schema validation,
 * methods, and static functions.
 *
 * @file src/models/__tests__/Settings.unit.test.ts
 */

import { describe, it, expect, beforeEach } from 'vitest';
import mongoose from 'mongoose';
import { Settings, ISettings, SettingsCategory } from '../Settings.js';

describe('Settings Model', () => {
  // Helper to create valid settings data
  const createValidSetting = (overrides = {}) => ({
    key: `setting_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
    value: 'test_value',
    category: 'general' as SettingsCategory,
    description: 'Test setting description',
    ...overrides,
  });

  // Clear test data before each test
  beforeEach(async () => {
    await Settings.deleteMany({ key: { $regex: /^test_/ } });
  });

  // ========================================
  // SCHEMA VALIDATION
  // ========================================
  describe('Schema Validation', () => {
    it('should create valid setting with required fields', async () => {
      const setting = new Settings(createValidSetting());
      const error = setting.validateSync();
      expect(error).toBeUndefined();
    });

    it('should require key', () => {
      const setting = new Settings(createValidSetting({ key: undefined }));
      const error = setting.validateSync();
      expect(error?.errors['key']).toBeDefined();
    });

    it('should require value', () => {
      const setting = new Settings(createValidSetting({ value: undefined }));
      const error = setting.validateSync();
      expect(error?.errors['value']).toBeDefined();
    });

    it('should require category', () => {
      const setting = new Settings(createValidSetting({ category: undefined }));
      const error = setting.validateSync();
      expect(error?.errors['category']).toBeDefined();
    });

    it('should require description', () => {
      const setting = new Settings(createValidSetting({ description: undefined }));
      const error = setting.validateSync();
      expect(error?.errors['description']).toBeDefined();
    });

    it('should default isPublic to false', () => {
      const setting = new Settings(createValidSetting());
      expect(setting.isPublic).toBe(false);
    });

    it('should lowercase key', () => {
      const setting = new Settings(createValidSetting({ key: 'MY_SETTING_KEY' }));
      expect(setting.key).toBe('my_setting_key');
    });

    it('should trim key', () => {
      const setting = new Settings(createValidSetting({ key: '  trimmed_key  ' }));
      expect(setting.key).toBe('trimmed_key');
    });

    it('should trim description', () => {
      const setting = new Settings(
        createValidSetting({ description: '  Trimmed description  ' })
      );
      expect(setting.description).toBe('Trimmed description');
    });
  });

  // ========================================
  // CATEGORY
  // ========================================
  describe('Category', () => {
    const validCategories: SettingsCategory[] = [
      'general',
      'shipping',
      'payment',
      'notification',
      'appearance',
    ];

    validCategories.forEach((category) => {
      it(`should accept category: ${category}`, () => {
        const setting = new Settings(createValidSetting({ category }));
        const error = setting.validateSync();
        expect(error?.errors['category']).toBeUndefined();
        expect(setting.category).toBe(category);
      });
    });

    it('should reject invalid category', () => {
      const setting = new Settings(createValidSetting({ category: 'invalid' }));
      const error = setting.validateSync();
      expect(error?.errors['category']).toBeDefined();
    });
  });

  // ========================================
  // VALUE TYPES
  // ========================================
  describe('Value Types', () => {
    it('should accept string value', async () => {
      const setting = await Settings.create(
        createValidSetting({
          key: 'test_string_value',
          value: 'Hello World',
        })
      );
      expect(setting.value).toBe('Hello World');
    });

    it('should accept number value', async () => {
      const setting = await Settings.create(
        createValidSetting({
          key: 'test_number_value',
          value: 42,
        })
      );
      expect(setting.value).toBe(42);
    });

    it('should accept boolean value', async () => {
      const setting = await Settings.create(
        createValidSetting({
          key: 'test_boolean_value',
          value: true,
        })
      );
      expect(setting.value).toBe(true);
    });

    it('should accept array value', async () => {
      const setting = await Settings.create(
        createValidSetting({
          key: 'test_array_value',
          value: ['item1', 'item2', 'item3'],
        })
      );
      expect(setting.value).toEqual(['item1', 'item2', 'item3']);
    });

    it('should accept object value', async () => {
      const setting = await Settings.create(
        createValidSetting({
          key: 'test_object_value',
          value: {
            currency: 'NGN',
            minOrder: 5000,
            maxOrder: 500000,
          },
        })
      );
      expect(setting.value.currency).toBe('NGN');
      expect(setting.value.minOrder).toBe(5000);
    });

    it('should accept nested object value', async () => {
      const setting = await Settings.create(
        createValidSetting({
          key: 'test_nested_value',
          value: {
            delivery: {
              sameDay: { fee: 2500, available: true },
              nextDay: { fee: 1500, available: true },
              standard: { fee: 1000, available: true },
            },
          },
        })
      );
      expect(setting.value.delivery.sameDay.fee).toBe(2500);
    });
  });

  // ========================================
  // OPTIONAL FIELDS
  // ========================================
  describe('Optional Fields', () => {
    it('should store isPublic flag', async () => {
      const setting = await Settings.create(
        createValidSetting({
          key: 'test_public_setting',
          isPublic: true,
        })
      );
      expect(setting.isPublic).toBe(true);
    });

    it('should store lastModifiedBy reference', async () => {
      const userId = new mongoose.Types.ObjectId();
      const setting = await Settings.create(
        createValidSetting({
          key: 'test_modified_by',
          lastModifiedBy: userId,
        })
      );
      expect(setting.lastModifiedBy?.toString()).toBe(userId.toString());
    });
  });

  // ========================================
  // STATICS
  // ========================================
  describe('Statics', () => {
    describe('getSetting', () => {
      it('should get setting value by key', async () => {
        await Settings.create(
          createValidSetting({
            key: 'test_get_setting',
            value: 'expected_value',
          })
        );

        const value = await Settings.getSetting('test_get_setting');
        expect(value).toBe('expected_value');
      });

      it('should get setting case-insensitively', async () => {
        await Settings.create(
          createValidSetting({
            key: 'test_case_insensitive',
            value: 'found',
          })
        );

        const value = await Settings.getSetting('TEST_CASE_INSENSITIVE');
        expect(value).toBe('found');
      });

      it('should return null for non-existent key', async () => {
        const value = await Settings.getSetting('nonexistent_key');
        expect(value).toBeNull();
      });

      it('should return complex values', async () => {
        await Settings.create(
          createValidSetting({
            key: 'test_complex_get',
            value: { enabled: true, limit: 100 },
          })
        );

        const value = await Settings.getSetting('test_complex_get');
        expect(value).toEqual({ enabled: true, limit: 100 });
      });
    });

    describe('setSetting', () => {
      it('should update setting value', async () => {
        await Settings.create(
          createValidSetting({
            key: 'test_set_setting',
            value: 'old_value',
          })
        );

        const updated = await Settings.setSetting('test_set_setting', 'new_value');
        expect(updated.value).toBe('new_value');
      });

      it('should set lastModifiedBy', async () => {
        await Settings.create(
          createValidSetting({
            key: 'test_set_modified_by',
            value: 'original',
          })
        );

        const userId = new mongoose.Types.ObjectId();
        const updated = await Settings.setSetting('test_set_modified_by', 'updated', userId);
        expect(updated.lastModifiedBy?.toString()).toBe(userId.toString());
      });

      it('should throw error for non-existent key', async () => {
        await expect(Settings.setSetting('nonexistent_key', 'value')).rejects.toThrow(
          "Setting with key 'nonexistent_key' not found"
        );
      });

      it('should work case-insensitively', async () => {
        await Settings.create(
          createValidSetting({
            key: 'test_set_case',
            value: 'before',
          })
        );

        const updated = await Settings.setSetting('TEST_SET_CASE', 'after');
        expect(updated.value).toBe('after');
      });
    });

    describe('getByCategory', () => {
      beforeEach(async () => {
        await Settings.create([
          createValidSetting({
            key: 'test_cat_shipping_1',
            category: 'shipping',
            value: 'ship1',
          }),
          createValidSetting({
            key: 'test_cat_shipping_2',
            category: 'shipping',
            value: 'ship2',
          }),
          createValidSetting({
            key: 'test_cat_payment_1',
            category: 'payment',
            value: 'pay1',
          }),
        ]);
      });

      it('should get settings by category', async () => {
        const shippingSettings = await Settings.getByCategory('shipping');
        const testSettings = shippingSettings.filter((s) =>
          s.key.startsWith('test_cat_shipping')
        );
        expect(testSettings).toHaveLength(2);
      });

      it('should return empty array for category with no settings', async () => {
        const appearanceSettings = await Settings.getByCategory('appearance');
        const testSettings = appearanceSettings.filter((s) => s.key.startsWith('test_cat'));
        expect(testSettings).toHaveLength(0);
      });

      it('should sort by key', async () => {
        const shippingSettings = await Settings.getByCategory('shipping');
        const testSettings = shippingSettings.filter((s) =>
          s.key.startsWith('test_cat_shipping')
        );
        expect(testSettings[0].key).toBe('test_cat_shipping_1');
        expect(testSettings[1].key).toBe('test_cat_shipping_2');
      });
    });

    describe('getPublicSettings', () => {
      beforeEach(async () => {
        await Settings.create([
          createValidSetting({
            key: 'test_public_1',
            isPublic: true,
            category: 'general',
          }),
          createValidSetting({
            key: 'test_public_2',
            isPublic: true,
            category: 'appearance',
          }),
          createValidSetting({
            key: 'test_private_1',
            isPublic: false,
            category: 'payment',
          }),
        ]);
      });

      it('should get only public settings', async () => {
        const publicSettings = await Settings.getPublicSettings();
        const testSettings = publicSettings.filter((s) => s.key.startsWith('test_'));
        expect(testSettings).toHaveLength(2);
        expect(testSettings.every((s) => s.isPublic)).toBe(true);
      });

      it('should not include private settings', async () => {
        const publicSettings = await Settings.getPublicSettings();
        const privateSettings = publicSettings.filter((s) => s.key === 'test_private_1');
        expect(privateSettings).toHaveLength(0);
      });
    });
  });

  // ========================================
  // UNIQUE CONSTRAINT
  // ========================================
  describe('Unique Constraint', () => {
    it('should enforce unique key', async () => {
      await Settings.create(createValidSetting({ key: 'test_unique_key' }));

      await expect(
        Settings.create(createValidSetting({ key: 'test_unique_key' }))
      ).rejects.toThrow();
    });

    it('should enforce unique key case-insensitively', async () => {
      await Settings.create(createValidSetting({ key: 'test_unique_case' }));

      await expect(
        Settings.create(createValidSetting({ key: 'TEST_UNIQUE_CASE' }))
      ).rejects.toThrow();
    });
  });

  // ========================================
  // TIMESTAMPS
  // ========================================
  describe('Timestamps', () => {
    it('should set createdAt on creation', async () => {
      const beforeCreate = new Date();
      const setting = await Settings.create(
        createValidSetting({ key: 'test_timestamps_create' })
      );
      expect(setting.createdAt).toBeDefined();
      expect(setting.createdAt.getTime()).toBeGreaterThanOrEqual(beforeCreate.getTime());
    });

    it('should set updatedAt on creation', async () => {
      const setting = await Settings.create(
        createValidSetting({ key: 'test_timestamps_update' })
      );
      expect(setting.updatedAt).toBeDefined();
    });

    it('should update updatedAt on save', async () => {
      const setting = await Settings.create(
        createValidSetting({ key: 'test_timestamps_save' })
      );
      const originalUpdatedAt = setting.updatedAt;

      await new Promise((resolve) => setTimeout(resolve, 10));
      setting.value = 'updated';
      await setting.save();

      expect(setting.updatedAt.getTime()).toBeGreaterThan(originalUpdatedAt.getTime());
    });
  });

  // ========================================
  // INDEXES
  // ========================================
  describe('Indexes', () => {
    it('should have key index', () => {
      const indexes = Settings.schema.indexes();
      const keyIndex = indexes.find(([fields]) => Object.keys(fields).includes('key'));
      expect(keyIndex).toBeDefined();
    });

    it('should have category index', () => {
      const indexes = Settings.schema.indexes();
      const categoryIndex = indexes.find(([fields]) =>
        Object.keys(fields).includes('category')
      );
      expect(categoryIndex).toBeDefined();
    });

    it('should have isPublic index', () => {
      const indexes = Settings.schema.indexes();
      const isPublicIndex = indexes.find(([fields]) =>
        Object.keys(fields).includes('isPublic')
      );
      expect(isPublicIndex).toBeDefined();
    });
  });

  // ========================================
  // DATABASE OPERATIONS
  // ========================================
  describe('Database Operations', () => {
    it('should create and find setting', async () => {
      const setting = await Settings.create(
        createValidSetting({ key: 'test_create_find' })
      );
      const found = await Settings.findById(setting._id);
      expect(found).not.toBeNull();
      expect(found?.key).toBe('test_create_find');
    });

    it('should update setting', async () => {
      const setting = await Settings.create(
        createValidSetting({
          key: 'test_update_setting',
          value: 'original',
        })
      );

      await Settings.findByIdAndUpdate(setting._id, { value: 'updated' });

      const found = await Settings.findById(setting._id);
      expect(found?.value).toBe('updated');
    });

    it('should delete setting', async () => {
      const setting = await Settings.create(
        createValidSetting({ key: 'test_delete_setting' })
      );

      await Settings.findByIdAndDelete(setting._id);

      const found = await Settings.findById(setting._id);
      expect(found).toBeNull();
    });
  });
});
