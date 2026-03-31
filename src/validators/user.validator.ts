/**
 * ============================================
 * USER VALIDATORS
 * ============================================
 *
 * Zod schemas for user profile operations,
 * address management, and scent preferences.
 *
 * @file src/validators/user.validator.ts
 */

import { z } from 'zod';
import { phoneSchema, nameSchema } from './auth.validator.js';

// ============================================
// CONSTANTS
// ============================================

export const SCENT_INTENSITIES = ['light', 'moderate', 'strong'] as const;

export const SCENT_NOTES = [
  'bergamot', 'lemon', 'orange', 'grapefruit',      // citrus top notes
  'lavender', 'rose', 'jasmine', 'violet',            // floral middle notes
  'oud', 'sandalwood', 'cedar', 'patchouli',          // woody base notes
  'vanilla', 'amber', 'musk', 'tonka',                // oriental base notes
  'vetiver', 'oakmoss', 'leather', 'tobacco',         // earthy/smoky notes
  'mint', 'eucalyptus', 'sea', 'green',               // fresh notes
] as const;

export const SCENT_OCCASIONS = [
  'daily', 'office', 'evening', 'date', 'sport',
  'casual', 'formal', 'wedding', 'outdoor',
] as const;

export const ADDRESS_LABELS = ['Home', 'Work', 'Other'] as const;

const AVATAR_URL_MAX = 2048;

// ============================================
// HELPER SCHEMAS
// ============================================

/**
 * Coordinates schema for delivery address geo-location
 */
export const CoordinatesSchema = z.object({
  lat: z
    .number()
    .min(-90, 'Latitude must be between -90 and 90')
    .max(90, 'Latitude must be between -90 and 90'),
  lng: z
    .number()
    .min(-180, 'Longitude must be between -180 and 180')
    .max(180, 'Longitude must be between -180 and 180'),
});

export type CoordinatesInput = z.infer<typeof CoordinatesSchema>;

// ============================================
// ADDRESS SCHEMAS
// ============================================

/**
 * Schema for creating a new address
 */
export const CreateAddressSchema = z.object({
  label: z
    .enum(ADDRESS_LABELS, { message: 'Label must be Home, Work, or Other' })
    .default('Home'),
  street: z
    .string()
    .min(5, 'Street address must be at least 5 characters')
    .max(200, 'Street address cannot exceed 200 characters')
    .transform((s) => s.trim()),
  city: z
    .string()
    .min(2, 'City must be at least 2 characters')
    .max(100, 'City cannot exceed 100 characters')
    .transform((s) => s.trim()),
  state: z
    .string()
    .min(2, 'State must be at least 2 characters')
    .max(100, 'State cannot exceed 100 characters')
    .transform((s) => s.trim()),
  country: z
    .string()
    .min(2, 'Country must be at least 2 characters')
    .max(100, 'Country cannot exceed 100 characters')
    .transform((s) => s.trim())
    .default('Nigeria'),
  postalCode: z
    .string()
    .max(20, 'Postal code cannot exceed 20 characters')
    .optional(),
  coordinates: CoordinatesSchema.optional(),
  isDefault: z.boolean().default(false),
});

export type CreateAddressInput = z.infer<typeof CreateAddressSchema>;

/**
 * Schema for updating an existing address (all fields optional)
 */
export const UpdateAddressSchema = CreateAddressSchema.partial().extend({
  isDefault: z.boolean().optional(),
});

export type UpdateAddressInput = z.infer<typeof UpdateAddressSchema>;

// ============================================
// SCENT PREFERENCES SCHEMAS
// ============================================

/**
 * Scent notes array — validates individual note strings
 */
const scentNotesArraySchema = z
  .array(z.string().min(1).max(100))
  .max(20, 'Cannot specify more than 20 scent notes');

/**
 * Schema for updating scent preferences
 */
export const UpdateScentPreferencesSchema = z.object({
  preferredNotes: scentNotesArraySchema.optional(),
  avoidNotes: scentNotesArraySchema.optional(),
  intensity: z
    .enum(SCENT_INTENSITIES, { message: 'Intensity must be light, moderate, or strong' })
    .optional(),
  occasions: z
    .array(z.string().min(1).max(50))
    .max(10, 'Cannot specify more than 10 occasions')
    .optional(),
});

export type UpdateScentPreferencesInput = z.infer<typeof UpdateScentPreferencesSchema>;

// ============================================
// PROFILE UPDATE SCHEMAS
// ============================================

/**
 * Schema for updating user profile information
 */
export const UpdateProfileSchema = z
  .object({
    firstName: nameSchema.optional(),
    lastName: nameSchema.optional(),
    phone: phoneSchema.optional(),
    avatar: z
      .string()
      .url('Avatar must be a valid URL')
      .max(AVATAR_URL_MAX, `Avatar URL cannot exceed ${AVATAR_URL_MAX} characters`)
      .optional(),
  })
  .refine(
    (data) => Object.values(data).some((v) => v !== undefined),
    { message: 'At least one field must be provided for profile update' }
  );

export type UpdateProfileInput = z.infer<typeof UpdateProfileSchema>;

// ============================================
// PAGINATION & QUERY SCHEMAS
// ============================================

/**
 * Standard pagination query parameters
 */
export const PaginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  sort: z
    .string()
    .regex(/^-?[a-zA-Z_]+$/, 'Invalid sort field')
    .optional(),
});

export type PaginationInput = z.infer<typeof PaginationSchema>;

/**
 * MongoDB ObjectId string validator
 */
export const ObjectIdSchema = z
  .string()
  .regex(/^[a-f\d]{24}$/i, 'Invalid ID format');

// ============================================
// ADMIN USER MANAGEMENT SCHEMAS
// ============================================

/**
 * Schema for admin updating user role or status
 */
export const AdminUpdateUserSchema = z
  .object({
    role: z.enum(['user', 'admin']).optional(),
    isActive: z.boolean().optional(),
    isVerified: z.boolean().optional(),
  })
  .refine(
    (data) => Object.values(data).some((v) => v !== undefined),
    { message: 'At least one field must be provided' }
  );

export type AdminUpdateUserInput = z.infer<typeof AdminUpdateUserSchema>;

/**
 * Schema for admin listing/filtering users
 */
export const ListUsersQuerySchema = PaginationSchema.extend({
  role: z.enum(['user', 'admin']).optional(),
  isActive: z
    .string()
    .transform((v) => v === 'true')
    .pipe(z.boolean())
    .optional(),
  search: z.string().max(200).optional(),
});

export type ListUsersQueryInput = z.infer<typeof ListUsersQuerySchema>;

// ============================================
// EXPORTS
// ============================================

export const UserValidators = {
  updateProfile: UpdateProfileSchema,
  createAddress: CreateAddressSchema,
  updateAddress: UpdateAddressSchema,
  updateScentPreferences: UpdateScentPreferencesSchema,
  pagination: PaginationSchema,
  objectId: ObjectIdSchema,
  adminUpdateUser: AdminUpdateUserSchema,
  listUsersQuery: ListUsersQuerySchema,
};

export default UserValidators;
