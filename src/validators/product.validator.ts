/**
 * ============================================
 * PRODUCT VALIDATORS
 * ============================================
 *
 * Zod schemas for product-related operations.
 *
 * @file src/validators/product.validator.ts
 */

import { z } from 'zod';

// ============================================
// CONSTANTS
// ============================================

export const PRODUCT_CATEGORIES = [
  'male',
  'female',
  'unisex',
  'children',
  'combo_mix',
] as const;

export const VARIANT_SIZES = ['20ml', '50ml', '100ml'] as const;

export const CONCENTRATION_TYPES = [
  'parfum',
  'eau_de_parfum',
  'eau_de_toilette',
  'eau_de_cologne',
  'body_mist',
] as const;

// ============================================
// HELPER SCHEMAS
// ============================================

/**
 * MongoDB ObjectId validation
 */
export const objectIdSchema = z
  .string()
  .regex(/^[0-9a-fA-F]{24}$/, 'Invalid ObjectId format');

/**
 * Price validation (positive number with 2 decimal places max)
 */
export const priceSchema = z
  .number()
  .positive('Price must be positive')
  .max(100000000, 'Price exceeds maximum allowed')
  .transform((val) => Math.round(val * 100) / 100);

/**
 * Percentage validation (0-100)
 */
export const percentageSchema = z
  .number()
  .min(0, 'Percentage cannot be negative')
  .max(100, 'Percentage cannot exceed 100');

// ============================================
// VARIANT SCHEMAS
// ============================================

/**
 * Product variant schema
 *
 * Field names match the Product Mongoose model (stock, costPrice).
 */
export const VariantSchema = z.object({
  size: z.enum(VARIANT_SIZES),
  sku: z
    .string()
    .min(3, 'SKU must be at least 3 characters')
    .max(50, 'SKU cannot exceed 50 characters')
    .regex(/^[A-Z0-9-]+$/, 'SKU must contain only uppercase letters, numbers, and hyphens'),
  priceNGN: priceSchema,
  priceUSD: priceSchema,
  // costPrice is tracked for P&L; defaults to 0 if omitted
  costPrice: z.number().min(0, 'Cost price cannot be negative').default(0),
  // "stock" matches the field name in the Product model (not stockQuantity)
  stock: z.number().int().min(0, 'Stock cannot be negative').default(0),
  lowStockThreshold: z.number().int().min(0).default(10).optional(),
  isAvailable: z.boolean().default(true),
});

export type VariantInput = z.infer<typeof VariantSchema>;

/**
 * Update variant schema (all fields optional)
 */
export const UpdateVariantSchema = VariantSchema.partial();

// ============================================
// SCENT NOTES SCHEMAS
// ============================================

/**
 * Scent notes validation
 */
export const ScentNotesSchema = z.object({
  top: z.array(z.string().min(1).max(50)).min(1, 'At least one top note required'),
  middle: z.array(z.string().min(1).max(50)).min(1, 'At least one middle note required'),
  base: z.array(z.string().min(1).max(50)).min(1, 'At least one base note required'),
});

export type ScentNotesInput = z.infer<typeof ScentNotesSchema>;

// ============================================
// IMAGE SCHEMAS
// ============================================

/**
 * Product images schema — matches the IProductImages interface in Product.ts.
 * The model stores images as a single object with named slots (boxed, bottle,
 * thumbnail, lifestyle) rather than an array of generic image objects.
 */
export const ProductImagesSchema = z.object({
  boxed: z.string().url('Boxed image must be a valid URL'),
  bottle: z.string().url('Bottle image must be a valid URL'),
  thumbnail: z.string().url('Thumbnail must be a valid URL'),
  lifestyle: z.string().url('Lifestyle image must be a valid URL').optional(),
});

export type ProductImagesInput = z.infer<typeof ProductImagesSchema>;

/**
 * Legacy / Cloudinary-style single image object (kept for backwards compat).
 */
export const ProductImageSchema = z.object({
  url: z.string().url('Invalid image URL'),
  publicId: z.string().optional(),
  alt: z.string().max(200).optional(),
  isPrimary: z.boolean().default(false),
  order: z.number().int().min(0).default(0),
});

export type ProductImageInput = z.infer<typeof ProductImageSchema>;

// ============================================
// CREATE PRODUCT SCHEMA
// ============================================

/**
 * Create product schema
 *
 * Field names align with the Product Mongoose model and ProductService.CreateProductData.
 */
export const CreateProductSchema = z.object({
  name: z
    .string()
    .min(2, 'Product name must be at least 2 characters')
    .max(200, 'Product name cannot exceed 200 characters')
    .trim(),
  brand: z
    .string()
    .min(1, 'Brand is required')
    .max(100, 'Brand cannot exceed 100 characters')
    .trim(),
  category: z.enum(PRODUCT_CATEGORIES),
  description: z
    .string()
    .min(10, 'Description must be at least 10 characters')
    .max(5000, 'Description cannot exceed 5000 characters')
    .trim()
    .optional(),
  shortDescription: z
    .string()
    .max(500, 'Short description cannot exceed 500 characters')
    .trim()
    .optional(),
  // Scent profile — scentFamily matches Product model field
  scentFamily: z
    .string()
    .min(1, 'Scent family is required')
    .max(50, 'Scent family cannot exceed 50 characters')
    .toLowerCase()
    .optional(),
  scentNotes: ScentNotesSchema.optional(),
  longevity: z
    .enum(['light', 'moderate', 'long-lasting', 'beast-mode'])
    .optional(),
  sillage: z
    .enum(['intimate', 'moderate', 'strong', 'enormous'])
    .optional(),
  concentration: z.enum(CONCENTRATION_TYPES).optional(),
  // images matches IProductImages in Product.ts (named slots, not an array)
  images: ProductImagesSchema.optional(),
  variants: z.array(VariantSchema).min(1, 'At least one variant is required'),
  tags: z.array(z.string().min(1).max(50)).max(20, 'Maximum 20 tags allowed').optional(),
  isActive: z.boolean().default(true),
  isFeatured: z.boolean().default(false),
  isNewArrival: z.boolean().default(true).optional(),
  isOriginal: z.boolean().default(true).optional(),
  seo: z
    .object({
      metaTitle: z.string().max(70).optional(),
      metaDescription: z.string().max(160).optional(),
    })
    .optional(),
});

export type CreateProductInput = z.infer<typeof CreateProductSchema>;

// ============================================
// UPDATE PRODUCT SCHEMA
// ============================================

/**
 * Update product schema (all fields optional)
 */
export const UpdateProductSchema = CreateProductSchema.partial().extend({
  variants: z.array(VariantSchema).min(1).optional(),
});

export type UpdateProductInput = z.infer<typeof UpdateProductSchema>;

// ============================================
// QUERY SCHEMAS
// ============================================

/**
 * Product list query parameters
 */
export const ProductQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  sort: z
    .enum(['name', 'price', 'createdAt', 'popularity', '-name', '-price', '-createdAt', '-popularity'])
    .default('-createdAt'),
  category: z.enum(PRODUCT_CATEGORIES).optional(),
  brand: z.string().optional(),
  minPrice: z.coerce.number().positive().optional(),
  maxPrice: z.coerce.number().positive().optional(),
  inStock: z.coerce.boolean().optional(),
  search: z.string().max(100).optional(),
  tags: z
    .string()
    .transform((val) => val.split(',').map((t) => t.trim()))
    .optional(),
  isActive: z.coerce.boolean().optional(),
  isFeatured: z.coerce.boolean().optional(),
});

export type ProductQueryInput = z.infer<typeof ProductQuerySchema>;

/**
 * Product search schema
 */
export const ProductSearchSchema = z.object({
  query: z.string().min(1, 'Search query is required').max(100),
  limit: z.coerce.number().int().positive().max(50).default(10),
  category: z.enum(PRODUCT_CATEGORIES).optional(),
});

export type ProductSearchInput = z.infer<typeof ProductSearchSchema>;

// ============================================
// STOCK MANAGEMENT SCHEMAS
// ============================================

/**
 * Update stock quantity schema
 */
export const UpdateStockSchema = z.object({
  variantSku: z
    .string()
    .regex(/^[A-Z0-9-]+$/, 'Invalid SKU format'),
  quantity: z.number().int(),
  operation: z.enum(['set', 'increment', 'decrement']).default('set'),
});

export type UpdateStockInput = z.infer<typeof UpdateStockSchema>;

/**
 * Bulk stock update schema
 */
export const BulkStockUpdateSchema = z.object({
  updates: z.array(UpdateStockSchema).min(1).max(100),
});

export type BulkStockUpdateInput = z.infer<typeof BulkStockUpdateSchema>;

// ============================================
// EXPORTS
// ============================================

export const ProductValidators = {
  createProduct: CreateProductSchema,
  updateProduct: UpdateProductSchema,
  productQuery: ProductQuerySchema,
  productSearch: ProductSearchSchema,
  variant: VariantSchema,
  updateVariant: UpdateVariantSchema,
  scentNotes: ScentNotesSchema,
  productImages: ProductImagesSchema,
  productImage: ProductImageSchema,
  updateStock: UpdateStockSchema,
  bulkStockUpdate: BulkStockUpdateSchema,
};

export default ProductValidators;
