/**
 * ============================================
 * PRODUCT MODEL
 * ============================================
 *
 * Multi-variant product system for fragrances.
 * Supports multiple sizes, dual currency pricing,
 * discounts, and scent profiles.
 *
 * @file src/models/Product.ts
 */

import mongoose, { Schema, Document, Model } from 'mongoose';

// ============================================
// INTERFACES
// ============================================

export interface IVariant {
  _id?: mongoose.Types.ObjectId;
  sku: string;
  size: '20ml' | '50ml' | '100ml';
  priceNGN: number;
  priceUSD: number;
  costPrice: number;
  stock: number;
  lowStockThreshold: number;
  isAvailable: boolean;
}

export interface IScentNotes {
  top: string[];
  middle: string[];
  base: string[];
}

export interface IProductStats {
  viewCount: number;
  purchaseCount: number;
  averageRating: number;
  reviewCount: number;
}

export interface IProductImages {
  boxed: string;
  bottle: string;
  lifestyle?: string;
  thumbnail: string;
}

export interface IProductSEO {
  metaTitle?: string;
  metaDescription?: string;
}

export interface IProduct extends Document {
  // Basic info
  name: string;
  slug: string;
  description: string;
  shortDescription?: string;

  // Classification
  category: 'male' | 'female' | 'unisex' | 'children' | 'combo_mix';
  brand: string;
  isOriginal: boolean;
  authenticityCertificate?: string;

  // Scent profile
  scentNotes: IScentNotes;
  scentFamily: string;
  longevity: 'light' | 'moderate' | 'long-lasting' | 'beast-mode';
  sillage: 'intimate' | 'moderate' | 'strong' | 'enormous';

  // Media
  images: IProductImages;

  // Variants and pricing
  variants: IVariant[];
  basePrice: number;
  maxPrice: number;

  // Discounts
  discountType?: 'percentage' | 'fixed';
  discountValue?: number;
  discountStartDate?: Date;
  discountEndDate?: Date;

  // Relationships
  layersWith: mongoose.Types.ObjectId[];
  qrCode?: string;
  tags: string[];

  // Analytics
  stats: IProductStats;

  // Status flags
  isActive: boolean;
  isFeatured: boolean;
  isNewArrival: boolean;

  // SEO
  seo: IProductSEO;

  // Timestamps
  createdAt: Date;
  updatedAt: Date;

  // Virtuals
  isOnSale: boolean;
  totalStock: number;
  inStock: boolean;

  // Methods
  getDiscountedPrice(variantSku: string, currency?: 'NGN' | 'USD'): number;
}

// ============================================
// SCHEMAS
// ============================================

const VariantSchema = new Schema<IVariant>(
  {
    sku: { type: String, required: [true, 'SKU is required'] },
    size: {
      type: String,
      enum: ['20ml', '50ml', '100ml'],
      required: [true, 'Size is required'],
    },
    priceNGN: { type: Number, required: [true, 'NGN price is required'], min: 0 },
    priceUSD: { type: Number, required: [true, 'USD price is required'], min: 0 },
    costPrice: { type: Number, required: [true, 'Cost price is required'], min: 0 },
    stock: { type: Number, required: true, min: 0, default: 0 },
    lowStockThreshold: { type: Number, default: 10 },
    isAvailable: { type: Boolean, default: true },
  },
  { _id: true }
);

const ScentNotesSchema = new Schema<IScentNotes>(
  {
    top: [{ type: String, lowercase: true }],
    middle: [{ type: String, lowercase: true }],
    base: [{ type: String, lowercase: true }],
  },
  { _id: false }
);

const ProductStatsSchema = new Schema<IProductStats>(
  {
    viewCount: { type: Number, default: 0 },
    purchaseCount: { type: Number, default: 0 },
    averageRating: { type: Number, default: 0, min: 0, max: 5 },
    reviewCount: { type: Number, default: 0 },
  },
  { _id: false }
);

const ProductImagesSchema = new Schema<IProductImages>(
  {
    boxed: { type: String, required: [true, 'Boxed image is required'] },
    bottle: { type: String, required: [true, 'Bottle image is required'] },
    lifestyle: String,
    thumbnail: { type: String, required: [true, 'Thumbnail image is required'] },
  },
  { _id: false }
);

const ProductSEOSchema = new Schema<IProductSEO>(
  {
    metaTitle: String,
    metaDescription: String,
  },
  { _id: false }
);

const ProductSchema = new Schema<IProduct>(
  {
    name: {
      type: String,
      required: [true, 'Product name is required'],
      trim: true,
      maxlength: [200, 'Name cannot exceed 200 characters'],
    },
    slug: {
      type: String,
      unique: true,
      lowercase: true,
    },
    description: {
      type: String,
      required: [true, 'Description is required'],
      maxlength: [5000, 'Description cannot exceed 5000 characters'],
    },
    shortDescription: {
      type: String,
      maxlength: [500, 'Short description cannot exceed 500 characters'],
    },

    category: {
      type: String,
      enum: ['male', 'female', 'unisex', 'children', 'combo_mix'],
      required: [true, 'Category is required'],
      index: true,
    },
    brand: {
      type: String,
      required: [true, 'Brand is required'],
      trim: true,
    },
    isOriginal: { type: Boolean, default: true },
    authenticityCertificate: String,

    scentNotes: ScentNotesSchema,
    scentFamily: {
      type: String,
      required: [true, 'Scent family is required'],
      lowercase: true,
      index: true,
    },
    longevity: {
      type: String,
      enum: ['light', 'moderate', 'long-lasting', 'beast-mode'],
      default: 'moderate',
    },
    sillage: {
      type: String,
      enum: ['intimate', 'moderate', 'strong', 'enormous'],
      default: 'moderate',
    },

    images: ProductImagesSchema,

    variants: [VariantSchema],
    basePrice: { type: Number, default: 0 },
    maxPrice: { type: Number, default: 0 },

    discountType: { type: String, enum: ['percentage', 'fixed'] },
    discountValue: { type: Number, min: 0 },
    discountStartDate: Date,
    discountEndDate: Date,

    layersWith: [{ type: Schema.Types.ObjectId, ref: 'Product' }],
    qrCode: String,
    tags: [{ type: String, lowercase: true }],

    stats: { type: ProductStatsSchema, default: () => ({}) },

    isActive: { type: Boolean, default: true, index: true },
    isFeatured: { type: Boolean, default: false, index: true },
    isNewArrival: { type: Boolean, default: true },

    seo: ProductSEOSchema,
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// ============================================
// INDEXES
// ============================================

ProductSchema.index({ name: 'text', description: 'text', tags: 'text' });
ProductSchema.index({ 'variants.sku': 1 });
ProductSchema.index({ basePrice: 1 });
ProductSchema.index({ createdAt: -1 });
ProductSchema.index({ category: 1, isActive: 1, isFeatured: 1 });

// ============================================
// VIRTUALS
// ============================================

// Check if product is currently on sale
ProductSchema.virtual('isOnSale').get(function (this: IProduct) {
  if (!this.discountValue || !this.discountStartDate || !this.discountEndDate) {
    return false;
  }
  const now = new Date();
  return now >= this.discountStartDate && now <= this.discountEndDate;
});

// Calculate total stock across all variants
ProductSchema.virtual('totalStock').get(function (this: IProduct) {
  return this.variants.reduce((sum, v) => sum + v.stock, 0);
});

// Check if any variant is in stock and available
ProductSchema.virtual('inStock').get(function (this: IProduct) {
  return this.variants.some((v) => v.stock > 0 && v.isAvailable);
});

// ============================================
// PRE-SAVE HOOKS
// ============================================

// Calculate price range and generate slug
ProductSchema.pre('save', function () {
  // Calculate base and max price from variants
  if (this.variants && this.variants.length > 0) {
    const prices = this.variants.map((v) => v.priceNGN);
    this.basePrice = Math.min(...prices);
    this.maxPrice = Math.max(...prices);
  }

  // Generate slug from name if not provided
  if (!this.slug) {
    this.slug = this.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '');
  }
});

// ============================================
// METHODS
// ============================================

/**
 * Get discounted price for a specific variant
 */
ProductSchema.methods.getDiscountedPrice = function (
  variantSku: string,
  currency: 'NGN' | 'USD' = 'NGN'
): number {
  const variant = this.variants.find((v: IVariant) => v.sku === variantSku);
  if (!variant) return 0;

  const price = currency === 'NGN' ? variant.priceNGN : variant.priceUSD;

  if (!this.isOnSale) return price;

  if (this.discountType === 'percentage') {
    return price * (1 - this.discountValue! / 100);
  }

  return Math.max(0, price - this.discountValue!);
};

// ============================================
// EXPORT
// ============================================

export const Product: Model<IProduct> =
  mongoose.models.Product || mongoose.model<IProduct>('Product', ProductSchema);

export default Product;
