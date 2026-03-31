/**
 * ============================================
 * SETTINGS VALIDATORS - TESTS
 * ============================================
 *
 * Tests for settings validation schemas.
 *
 * @file src/validators/__tests__/settings.validator.test.ts
 */

import { describe, it, expect } from 'vitest';
import {
  CreateSettingSchema,
  UpdateSettingSchema,
  UpdateSettingMetadataSchema,
  BatchUpdateSettingsSchema,
  SettingsQuerySchema,
  ShippingSettingsSchema,
  PaymentSettingsSchema,
  NotificationSettingsSchema,
  AppearanceSettingsSchema,
  SettingValueSchema,
} from '../settings.validator.js';

describe('Settings Validators', () => {
  // ========================================
  // SETTING VALUE SCHEMA
  // ========================================
  describe('SettingValueSchema', () => {
    it('should accept string value', () => {
      const result = SettingValueSchema.safeParse('test');
      expect(result.success).toBe(true);
    });

    it('should accept number value', () => {
      const result = SettingValueSchema.safeParse(42);
      expect(result.success).toBe(true);
    });

    it('should accept boolean value', () => {
      const result = SettingValueSchema.safeParse(true);
      expect(result.success).toBe(true);
    });

    it('should accept array value', () => {
      const result = SettingValueSchema.safeParse(['a', 'b', 'c']);
      expect(result.success).toBe(true);
    });

    it('should accept object value', () => {
      const result = SettingValueSchema.safeParse({ nested: { value: 123 } });
      expect(result.success).toBe(true);
    });
  });

  // ========================================
  // CREATE SETTING SCHEMA
  // ========================================
  describe('CreateSettingSchema', () => {
    const validSetting = {
      key: 'site_name',
      value: 'Scentxury',
      category: 'general' as const,
      description: 'The name of the website',
    };

    it('should accept valid setting', () => {
      const result = CreateSettingSchema.safeParse(validSetting);
      expect(result.success).toBe(true);
    });

    it('should accept all valid categories', () => {
      const categories = ['general', 'shipping', 'payment', 'notification', 'appearance'] as const;
      categories.forEach((category) => {
        const result = CreateSettingSchema.safeParse({ ...validSetting, category });
        expect(result.success).toBe(true);
      });
    });

    it('should default isPublic to false', () => {
      const result = CreateSettingSchema.safeParse(validSetting);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.isPublic).toBe(false);
      }
    });

    it('should accept isPublic true', () => {
      const result = CreateSettingSchema.safeParse({
        ...validSetting,
        isPublic: true,
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.isPublic).toBe(true);
      }
    });

    it('should reject key starting with number', () => {
      const result = CreateSettingSchema.safeParse({
        ...validSetting,
        key: '1_invalid',
      });
      expect(result.success).toBe(false);
    });

    it('should reject key with uppercase', () => {
      const result = CreateSettingSchema.safeParse({
        ...validSetting,
        key: 'Invalid_Key',
      });
      expect(result.success).toBe(false);
    });

    it('should reject key with special characters', () => {
      const result = CreateSettingSchema.safeParse({
        ...validSetting,
        key: 'invalid-key',
      });
      expect(result.success).toBe(false);
    });

    it('should reject short description', () => {
      const result = CreateSettingSchema.safeParse({
        ...validSetting,
        description: 'Hi',
      });
      expect(result.success).toBe(false);
    });

    it('should accept complex value types', () => {
      const result = CreateSettingSchema.safeParse({
        ...validSetting,
        value: {
          enabled: true,
          options: ['a', 'b'],
          nested: { level: 2 },
        },
      });
      expect(result.success).toBe(true);
    });
  });

  // ========================================
  // UPDATE SETTING SCHEMA
  // ========================================
  describe('UpdateSettingSchema', () => {
    it('should accept valid value update', () => {
      const result = UpdateSettingSchema.safeParse({
        value: 'new value',
      });
      expect(result.success).toBe(true);
    });

    it('should accept complex value', () => {
      const result = UpdateSettingSchema.safeParse({
        value: { enabled: true, limit: 100 },
      });
      expect(result.success).toBe(true);
    });
  });

  // ========================================
  // UPDATE SETTING METADATA SCHEMA
  // ========================================
  describe('UpdateSettingMetadataSchema', () => {
    it('should accept partial update', () => {
      const result = UpdateSettingMetadataSchema.safeParse({
        isPublic: true,
      });
      expect(result.success).toBe(true);
    });

    it('should accept empty object', () => {
      const result = UpdateSettingMetadataSchema.safeParse({});
      expect(result.success).toBe(true);
    });

    it('should accept full metadata update', () => {
      const result = UpdateSettingMetadataSchema.safeParse({
        description: 'Updated description here',
        isPublic: true,
        category: 'shipping',
      });
      expect(result.success).toBe(true);
    });

    it('should reject short description', () => {
      const result = UpdateSettingMetadataSchema.safeParse({
        description: 'Hi',
      });
      expect(result.success).toBe(false);
    });
  });

  // ========================================
  // BATCH UPDATE SETTINGS SCHEMA
  // ========================================
  describe('BatchUpdateSettingsSchema', () => {
    it('should accept valid batch update', () => {
      const result = BatchUpdateSettingsSchema.safeParse({
        settings: [
          { key: 'setting1', value: 'value1' },
          { key: 'setting2', value: 123 },
        ],
      });
      expect(result.success).toBe(true);
    });

    it('should require at least one setting', () => {
      const result = BatchUpdateSettingsSchema.safeParse({
        settings: [],
      });
      expect(result.success).toBe(false);
    });

    it('should reject more than 50 settings', () => {
      const settings = Array(51)
        .fill(null)
        .map((_, i) => ({ key: `setting_${i}`, value: i }));
      const result = BatchUpdateSettingsSchema.safeParse({ settings });
      expect(result.success).toBe(false);
    });
  });

  // ========================================
  // SETTINGS QUERY SCHEMA
  // ========================================
  describe('SettingsQuerySchema', () => {
    it('should accept empty query', () => {
      const result = SettingsQuerySchema.safeParse({});
      expect(result.success).toBe(true);
    });

    it('should accept category filter', () => {
      const result = SettingsQuerySchema.safeParse({
        category: 'shipping',
      });
      expect(result.success).toBe(true);
    });

    it('should accept isPublic filter', () => {
      const result = SettingsQuerySchema.safeParse({
        isPublic: true,
      });
      expect(result.success).toBe(true);
    });

    it('should accept search term', () => {
      const result = SettingsQuerySchema.safeParse({
        search: 'delivery',
      });
      expect(result.success).toBe(true);
    });

    it('should reject invalid category', () => {
      const result = SettingsQuerySchema.safeParse({
        category: 'invalid',
      });
      expect(result.success).toBe(false);
    });
  });

  // ========================================
  // SHIPPING SETTINGS SCHEMA
  // ========================================
  describe('ShippingSettingsSchema', () => {
    const validShippingSettings = {
      sameDayDelivery: {
        enabled: true,
        cutoffTime: '14:00',
        baseFee: 2500,
        freeThreshold: 50000,
      },
      nextDayDelivery: {
        enabled: true,
        baseFee: 1500,
      },
      standardDelivery: {
        enabled: true,
        baseFee: 1000,
        estimatedDays: 3,
      },
      servicedLocations: ['Lagos', 'Abuja', 'Port Harcourt'],
    };

    it('should accept valid shipping settings', () => {
      const result = ShippingSettingsSchema.safeParse(validShippingSettings);
      expect(result.success).toBe(true);
    });

    it('should reject invalid cutoff time format', () => {
      const result = ShippingSettingsSchema.safeParse({
        ...validShippingSettings,
        sameDayDelivery: {
          ...validShippingSettings.sameDayDelivery,
          cutoffTime: '2:00 PM',
        },
      });
      expect(result.success).toBe(false);
    });

    it('should require at least one serviced location', () => {
      const result = ShippingSettingsSchema.safeParse({
        ...validShippingSettings,
        servicedLocations: [],
      });
      expect(result.success).toBe(false);
    });

    it('should accept restricted areas', () => {
      const result = ShippingSettingsSchema.safeParse({
        ...validShippingSettings,
        restrictedAreas: ['Remote Village'],
      });
      expect(result.success).toBe(true);
    });
  });

  // ========================================
  // PAYMENT SETTINGS SCHEMA
  // ========================================
  describe('PaymentSettingsSchema', () => {
    const validPaymentSettings = {
      paystack: {
        enabled: true,
        currencies: ['NGN'],
        minAmount: 1000,
        maxAmount: 10000000,
      },
      stripe: {
        enabled: true,
        currencies: ['USD'],
        minAmount: 10,
        maxAmount: 100000,
      },
      bankTransfer: {
        enabled: true,
        bankName: 'GTBank',
        accountNumber: '0123456789',
        accountName: 'Chi Fragrance Ltd',
      },
      cashOnDelivery: {
        enabled: true,
        maxAmount: 100000,
      },
    };

    it('should accept valid payment settings', () => {
      const result = PaymentSettingsSchema.safeParse(validPaymentSettings);
      expect(result.success).toBe(true);
    });

    it('should accept multiple currencies', () => {
      const result = PaymentSettingsSchema.safeParse({
        ...validPaymentSettings,
        paystack: {
          ...validPaymentSettings.paystack,
          currencies: ['NGN', 'USD'],
        },
      });
      expect(result.success).toBe(true);
    });

    it('should reject invalid currency', () => {
      const result = PaymentSettingsSchema.safeParse({
        ...validPaymentSettings,
        paystack: {
          ...validPaymentSettings.paystack,
          currencies: ['EUR'],
        },
      });
      expect(result.success).toBe(false);
    });
  });

  // ========================================
  // NOTIFICATION SETTINGS SCHEMA
  // ========================================
  describe('NotificationSettingsSchema', () => {
    const validNotificationSettings = {
      email: {
        enabled: true,
        orderConfirmation: true,
        shippingUpdates: true,
        promotions: false,
        abandonedCart: true,
      },
      sms: {
        enabled: true,
        orderConfirmation: true,
        deliveryUpdates: true,
      },
      push: {
        enabled: false,
        orderUpdates: false,
        promotions: false,
        recommendations: false,
      },
    };

    it('should accept valid notification settings', () => {
      const result = NotificationSettingsSchema.safeParse(validNotificationSettings);
      expect(result.success).toBe(true);
    });

    it('should require all notification types', () => {
      const { email, ...rest } = validNotificationSettings;
      const result = NotificationSettingsSchema.safeParse(rest);
      expect(result.success).toBe(false);
    });
  });

  // ========================================
  // APPEARANCE SETTINGS SCHEMA
  // ========================================
  describe('AppearanceSettingsSchema', () => {
    const validAppearanceSettings = {
      primaryColor: '#8B4513',
      secondaryColor: '#D4AF37',
      logo: {
        url: 'https://example.com/logo.png',
        alt: 'Chi Fragrance Logo',
      },
    };

    it('should accept valid appearance settings', () => {
      const result = AppearanceSettingsSchema.safeParse(validAppearanceSettings);
      expect(result.success).toBe(true);
    });

    it('should accept full appearance settings', () => {
      const fullSettings = {
        ...validAppearanceSettings,
        favicon: 'https://example.com/favicon.ico',
        bannerImages: [
          {
            url: 'https://example.com/banner1.jpg',
            alt: 'Banner 1',
            link: '/collection/new',
            order: 0,
          },
        ],
        socialLinks: {
          instagram: 'https://instagram.com/chifragrance',
          facebook: 'https://facebook.com/chifragrance',
        },
      };
      const result = AppearanceSettingsSchema.safeParse(fullSettings);
      expect(result.success).toBe(true);
    });

    it('should reject invalid hex color', () => {
      const result = AppearanceSettingsSchema.safeParse({
        ...validAppearanceSettings,
        primaryColor: 'red',
      });
      expect(result.success).toBe(false);
    });

    it('should reject invalid logo URL', () => {
      const result = AppearanceSettingsSchema.safeParse({
        ...validAppearanceSettings,
        logo: {
          url: 'not-a-url',
        },
      });
      expect(result.success).toBe(false);
    });

    it('should accept lowercase hex colors', () => {
      const result = AppearanceSettingsSchema.safeParse({
        ...validAppearanceSettings,
        primaryColor: '#8b4513',
      });
      expect(result.success).toBe(true);
    });
  });
});
