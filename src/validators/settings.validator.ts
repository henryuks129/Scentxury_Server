/**
 * ============================================
 * SETTINGS VALIDATORS
 * ============================================
 *
 * Zod schemas for settings-related operations.
 *
 * @file src/validators/settings.validator.ts
 */

import { z } from 'zod';

// ============================================
// CONSTANTS
// ============================================

export const SETTINGS_CATEGORIES = [
  'general',
  'shipping',
  'payment',
  'notification',
  'appearance',
] as const;

// ============================================
// VALUE SCHEMAS
// ============================================

/**
 * Setting value can be any JSON-compatible type
 */
export const SettingValueSchema = z.union([
  z.string(),
  z.number(),
  z.boolean(),
  z.array(z.unknown()),
  z.record(z.string(), z.unknown()),
]);

// ============================================
// CREATE SETTING SCHEMA
// ============================================

/**
 * Create new setting schema
 */
export const CreateSettingSchema = z.object({
  key: z
    .string()
    .min(2, 'Setting key must be at least 2 characters')
    .max(100, 'Setting key cannot exceed 100 characters')
    .regex(
      /^[a-z][a-z0-9_]*$/,
      'Key must start with lowercase letter and contain only lowercase letters, numbers, and underscores'
    ),
  value: SettingValueSchema,
  category: z.enum(SETTINGS_CATEGORIES),
  description: z
    .string()
    .min(5, 'Description must be at least 5 characters')
    .max(500, 'Description cannot exceed 500 characters')
    .trim(),
  isPublic: z.boolean().default(false),
});

export type CreateSettingInput = z.infer<typeof CreateSettingSchema>;

// ============================================
// UPDATE SETTING SCHEMA
// ============================================

/**
 * Update setting value schema
 */
export const UpdateSettingSchema = z.object({
  value: SettingValueSchema,
});

export type UpdateSettingInput = z.infer<typeof UpdateSettingSchema>;

/**
 * Update setting metadata schema
 */
export const UpdateSettingMetadataSchema = z.object({
  description: z
    .string()
    .min(5)
    .max(500)
    .trim()
    .optional(),
  isPublic: z.boolean().optional(),
  category: z.enum(SETTINGS_CATEGORIES).optional(),
});

export type UpdateSettingMetadataInput = z.infer<typeof UpdateSettingMetadataSchema>;

// ============================================
// BATCH UPDATE SCHEMA
// ============================================

/**
 * Batch update settings schema
 */
export const BatchUpdateSettingsSchema = z.object({
  settings: z
    .array(
      z.object({
        key: z.string().min(1),
        value: SettingValueSchema,
      })
    )
    .min(1, 'At least one setting is required')
    .max(50, 'Maximum 50 settings per batch'),
});

export type BatchUpdateSettingsInput = z.infer<typeof BatchUpdateSettingsSchema>;

// ============================================
// QUERY SCHEMAS
// ============================================

/**
 * Settings query parameters
 */
export const SettingsQuerySchema = z.object({
  category: z.enum(SETTINGS_CATEGORIES).optional(),
  isPublic: z.boolean().optional(),
  search: z.string().max(100).optional(),
});

export type SettingsQueryInput = z.infer<typeof SettingsQuerySchema>;

// ============================================
// SPECIFIC SETTINGS SCHEMAS
// ============================================

/**
 * Shipping settings schema
 */
export const ShippingSettingsSchema = z.object({
  sameDayDelivery: z.object({
    enabled: z.boolean(),
    cutoffTime: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/, 'Invalid time format (HH:MM)'),
    baseFee: z.number().positive(),
    freeThreshold: z.number().positive().optional(),
  }),
  nextDayDelivery: z.object({
    enabled: z.boolean(),
    baseFee: z.number().positive(),
    freeThreshold: z.number().positive().optional(),
  }),
  standardDelivery: z.object({
    enabled: z.boolean(),
    baseFee: z.number().positive(),
    estimatedDays: z.number().int().positive(),
    freeThreshold: z.number().positive().optional(),
  }),
  servicedLocations: z.array(z.string()).min(1),
  restrictedAreas: z.array(z.string()).optional(),
});

export type ShippingSettingsInput = z.infer<typeof ShippingSettingsSchema>;

/**
 * Payment settings schema
 */
export const PaymentSettingsSchema = z.object({
  paystack: z.object({
    enabled: z.boolean(),
    currencies: z.array(z.enum(['NGN', 'USD'])),
    minAmount: z.number().positive(),
    maxAmount: z.number().positive(),
  }),
  stripe: z.object({
    enabled: z.boolean(),
    currencies: z.array(z.enum(['NGN', 'USD'])),
    minAmount: z.number().positive(),
    maxAmount: z.number().positive(),
  }),
  bankTransfer: z.object({
    enabled: z.boolean(),
    bankName: z.string(),
    accountNumber: z.string(),
    accountName: z.string(),
  }),
  cashOnDelivery: z.object({
    enabled: z.boolean(),
    maxAmount: z.number().positive().optional(),
    availableLocations: z.array(z.string()).optional(),
  }),
});

export type PaymentSettingsInput = z.infer<typeof PaymentSettingsSchema>;

/**
 * Notification settings schema
 */
export const NotificationSettingsSchema = z.object({
  email: z.object({
    enabled: z.boolean(),
    orderConfirmation: z.boolean(),
    shippingUpdates: z.boolean(),
    promotions: z.boolean(),
    abandonedCart: z.boolean(),
  }),
  sms: z.object({
    enabled: z.boolean(),
    orderConfirmation: z.boolean(),
    deliveryUpdates: z.boolean(),
  }),
  push: z.object({
    enabled: z.boolean(),
    orderUpdates: z.boolean(),
    promotions: z.boolean(),
    recommendations: z.boolean(),
  }),
});

export type NotificationSettingsInput = z.infer<typeof NotificationSettingsSchema>;

/**
 * Appearance settings schema
 */
export const AppearanceSettingsSchema = z.object({
  primaryColor: z
    .string()
    .regex(/^#[0-9A-Fa-f]{6}$/, 'Invalid hex color'),
  secondaryColor: z
    .string()
    .regex(/^#[0-9A-Fa-f]{6}$/, 'Invalid hex color'),
  logo: z.object({
    url: z.string().url(),
    alt: z.string().max(100).optional(),
  }),
  favicon: z.string().url().optional(),
  bannerImages: z
    .array(
      z.object({
        url: z.string().url(),
        alt: z.string().max(100).optional(),
        link: z.string().optional(),
        order: z.number().int().min(0),
      })
    )
    .optional(),
  socialLinks: z
    .object({
      instagram: z.string().url().optional(),
      facebook: z.string().url().optional(),
      twitter: z.string().url().optional(),
      tiktok: z.string().url().optional(),
    })
    .optional(),
});

export type AppearanceSettingsInput = z.infer<typeof AppearanceSettingsSchema>;

// ============================================
// EXPORTS
// ============================================

export const SettingsValidators = {
  createSetting: CreateSettingSchema,
  updateSetting: UpdateSettingSchema,
  updateSettingMetadata: UpdateSettingMetadataSchema,
  batchUpdateSettings: BatchUpdateSettingsSchema,
  settingsQuery: SettingsQuerySchema,
  shippingSettings: ShippingSettingsSchema,
  paymentSettings: PaymentSettingsSchema,
  notificationSettings: NotificationSettingsSchema,
  appearanceSettings: AppearanceSettingsSchema,
};

export default SettingsValidators;
