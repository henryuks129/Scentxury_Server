/**
 * ============================================
 * SETTINGS MODEL
 * ============================================
 *
 * Admin site configuration and settings storage.
 * Key-value store with categorization and
 * flexible schema for values.
 *
 * @file src/models/Settings.ts
 */

import mongoose, { Schema, Document, Model } from 'mongoose';

// ============================================
// INTERFACES
// ============================================

export type SettingsCategory =
  | 'general'
  | 'shipping'
  | 'payment'
  | 'notification'
  | 'appearance';

export interface ISettings extends Document {
  key: string;
  value: unknown;
  category: SettingsCategory;
  description: string;
  isPublic: boolean;
  lastModifiedBy?: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

// Extend Model interface for statics
interface ISettingsModel extends Model<ISettings> {
  getSetting(key: string): Promise<unknown>;
  setSetting(key: string, value: unknown, userId?: mongoose.Types.ObjectId): Promise<ISettings>;
  getByCategory(category: SettingsCategory): Promise<ISettings[]>;
  getPublicSettings(): Promise<ISettings[]>;
}

// ============================================
// SCHEMA
// ============================================

const SettingsSchema = new Schema<ISettings>(
  {
    key: {
      type: String,
      required: [true, 'Setting key is required'],
      unique: true,
      lowercase: true,
      trim: true,
      index: true,
    },
    value: {
      type: Schema.Types.Mixed,
      required: [true, 'Setting value is required'],
    },
    category: {
      type: String,
      enum: ['general', 'shipping', 'payment', 'notification', 'appearance'],
      required: [true, 'Category is required'],
      index: true,
    },
    description: {
      type: String,
      required: [true, 'Description is required'],
      trim: true,
    },
    isPublic: {
      type: Boolean,
      default: false,
      index: true,
    },
    lastModifiedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
    },
  },
  {
    timestamps: true,
  }
);

// ============================================
// INDEXES
// ============================================

SettingsSchema.index({ category: 1, key: 1 });
SettingsSchema.index({ isPublic: 1, category: 1 });

// ============================================
// STATICS
// ============================================

/**
 * Get a setting value by key
 */
SettingsSchema.statics.getSetting = async function (key: string): Promise<unknown> {
  const setting = await this.findOne({ key: key.toLowerCase() });
  return setting?.value ?? null;
};

/**
 * Set a setting value
 */
SettingsSchema.statics.setSetting = async function (
  key: string,
  value: unknown,
  userId?: mongoose.Types.ObjectId
): Promise<ISettings> {
  const setting = await this.findOneAndUpdate(
    { key: key.toLowerCase() },
    {
      $set: {
        value,
        lastModifiedBy: userId,
      },
    },
    { new: true }
  );

  if (!setting) {
    throw new Error(`Setting with key '${key}' not found`);
  }

  return setting;
};

/**
 * Get all settings by category
 */
SettingsSchema.statics.getByCategory = async function (
  category: SettingsCategory
): Promise<ISettings[]> {
  return this.find({ category }).sort({ key: 1 }).lean();
};

/**
 * Get all public settings
 */
SettingsSchema.statics.getPublicSettings = async function (): Promise<ISettings[]> {
  return this.find({ isPublic: true }).sort({ category: 1, key: 1 }).lean();
};

// ============================================
// EXPORT
// ============================================

export const Settings: ISettingsModel =
  (mongoose.models.Settings as ISettingsModel) ||
  mongoose.model<ISettings, ISettingsModel>('Settings', SettingsSchema);

export default Settings;
