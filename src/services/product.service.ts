/**
 * ============================================
 * PRODUCT SERVICE
 * ============================================
 *
 * Business logic for product management:
 * - Paginated listing with filters
 * - Full-text search
 * - CRUD operations (admin)
 * - Stock management
 * - Featured/category views
 *
 * @file src/services/product.service.ts
 */

import { Product, IProduct } from '@models/Product.js';
import { InventoryTransaction } from '@models/InventoryTransaction.js';
import {
  NotFoundError,
  ConflictError,
  BadRequestError,
} from '@utils/errors.js';
import type { PaginationMeta } from '@utils/response.js';
import { getIO } from '@config/socket.js';
import mongoose from 'mongoose';

// ============================================
// TYPES
// ============================================

export interface ProductFilter {
  category?: string;
  scentFamily?: string;
  brand?: string;
  minPrice?: number;
  maxPrice?: number;
  inStock?: boolean;
  isFeatured?: boolean;
  isActive?: boolean;
  tags?: string[];
  search?: string;
}

export type SortOption =
  | 'price_asc'
  | 'price_desc'
  | 'name_asc'
  | 'name_desc'
  | '-createdAt'
  | 'createdAt'
  | '-popularity'
  | 'popularity';

export interface ProductListOptions {
  page?: number;
  limit?: number;
  sort?: SortOption | string;
  filter?: ProductFilter;
}

export interface ProductListResult {
  products: IProduct[];
  pagination: PaginationMeta;
}

export interface CreateProductData {
  name: string;
  description: string;
  shortDescription?: string;
  category: 'male' | 'female' | 'unisex' | 'children' | 'combo_mix';
  brand: string;
  scentFamily: string;
  scentNotes?: { top: string[]; middle: string[]; base: string[] };
  images: { boxed: string; bottle: string; thumbnail: string; lifestyle?: string };
  variants: Array<{
    sku: string;
    size: '20ml' | '50ml' | '100ml';
    priceNGN: number;
    priceUSD: number;
    costPrice: number;
    stock: number;
    lowStockThreshold?: number;
  }>;
  tags?: string[];
  isFeatured?: boolean;
  isNewArrival?: boolean;
  longevity?: 'light' | 'moderate' | 'long-lasting' | 'beast-mode';
  sillage?: 'intimate' | 'moderate' | 'strong' | 'enormous';
  layersWith?: string[];
}

export type UpdateProductData = Partial<CreateProductData> & {
  isActive?: boolean;
};

// ============================================
// SORT MAP
// ============================================

const SORT_MAP: Record<string, Record<string, 1 | -1>> = {
  price_asc: { basePrice: 1 },
  price_desc: { basePrice: -1 },
  name_asc: { name: 1 },
  name_desc: { name: -1 },
  '-createdAt': { createdAt: -1 },
  createdAt: { createdAt: 1 },
  '-popularity': { 'stats.purchaseCount': -1 },
  popularity: { 'stats.purchaseCount': 1 },
};

// ============================================
// PRODUCT SERVICE
// ============================================

export class ProductService {
  /**
   * Get paginated, filtered product list
   */
  static async getProducts(options: ProductListOptions = {}): Promise<ProductListResult> {
    const {
      page = 1,
      limit = 20,
      sort = '-createdAt',
      filter = {},
    } = options;

    const skip = (page - 1) * limit;
    const query: Record<string, unknown> = { isActive: true };

    // Apply filters
    if (filter.category) query.category = filter.category;
    if (filter.scentFamily) query.scentFamily = filter.scentFamily;
    if (filter.brand) query.brand = filter.brand;
    if (filter.isFeatured !== undefined) query.isFeatured = filter.isFeatured;
    if (filter.tags?.length) query.tags = { $in: filter.tags };

    if (filter.minPrice !== undefined || filter.maxPrice !== undefined) {
      const priceFilter: Record<string, number> = {};
      if (filter.minPrice !== undefined) priceFilter.$gte = filter.minPrice;
      if (filter.maxPrice !== undefined) priceFilter.$lte = filter.maxPrice;
      query.basePrice = priceFilter;
    }

    if (filter.inStock) {
      query['variants'] = { $elemMatch: { stock: { $gt: 0 }, isAvailable: true } };
    }

    const sortObj = SORT_MAP[sort] ?? { createdAt: -1 };

    const [products, total] = await Promise.all([
      Product.find(query).sort(sortObj).skip(skip).limit(limit).lean(),
      Product.countDocuments(query),
    ]);

    const totalPages = Math.ceil(total / limit);

    return {
      products: products as unknown as IProduct[],
      pagination: {
        page,
        limit,
        total,
        totalPages,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1,
      },
    };
  }

  /**
   * Get single product by slug (increments view count)
   */
  static async getProductBySlug(slug: string): Promise<IProduct> {
    const product = await Product.findOne({ slug, isActive: true }).populate(
      'layersWith',
      'name slug images basePrice'
    );

    if (!product) {
      throw new NotFoundError('Product', 'RES_002');
    }

    // Increment view count (fire-and-forget)
    Product.findByIdAndUpdate(product._id, {
      $inc: { 'stats.viewCount': 1 },
    }).catch(() => {});

    return product;
  }

  /**
   * Full-text search
   */
  static async searchProducts(
    q: string,
    limit = 20,
    category?: string
  ): Promise<IProduct[]> {
    if (!q.trim()) return [];

    const filter: Record<string, unknown> = {
      $text: { $search: q },
      isActive: true,
    };
    if (category) filter.category = category;

    const products = await Product.find(filter, { score: { $meta: 'textScore' } })
      .sort({ score: { $meta: 'textScore' } })
      .limit(limit)
      .lean();

    return products as unknown as IProduct[];
  }

  /**
   * Get featured and new arrival products
   */
  static async getFeaturedProducts(limit = 10): Promise<{
    featured: IProduct[];
    newArrivals: IProduct[];
  }> {
    const [featured, newArrivals] = await Promise.all([
      Product.find({ isFeatured: true, isActive: true })
        .sort({ 'stats.purchaseCount': -1 })
        .limit(limit)
        .lean(),
      Product.find({ isNewArrival: true, isActive: true })
        .sort({ createdAt: -1 })
        .limit(limit)
        .lean(),
    ]);

    return {
      featured: featured as unknown as IProduct[],
      newArrivals: newArrivals as unknown as IProduct[],
    };
  }

  /**
   * Get products by category with pagination
   */
  static async getProductsByCategory(
    category: string,
    options: { page?: number; limit?: number; sort?: string } = {}
  ): Promise<ProductListResult> {
    return ProductService.getProducts({
      ...options,
      filter: { category },
    });
  }

  /**
   * Create a new product (admin)
   */
  static async createProduct(data: CreateProductData): Promise<IProduct> {
    // Check for duplicate SKUs
    const skus = data.variants.map((v) => v.sku);
    const existing = await Product.findOne({ 'variants.sku': { $in: skus } });
    if (existing) {
      throw new ConflictError(
        `SKU already exists: ${skus.find((sku) =>
          existing.variants.some((v) => v.sku === sku)
        )}`
      );
    }

    const product = await Product.create(data);
    return product;
  }

  /**
   * Update a product (admin)
   */
  static async updateProduct(
    slug: string,
    data: UpdateProductData
  ): Promise<IProduct> {
    const product = await Product.findOne({ slug });
    if (!product) {
      throw new NotFoundError('Product', 'RES_002');
    }

    // If updating variants, check for SKU conflicts (excluding self)
    if (data.variants) {
      const skus = data.variants.map((v) => v.sku);
      const conflict = await Product.findOne({
        _id: { $ne: product._id },
        'variants.sku': { $in: skus },
      });
      if (conflict) {
        throw new ConflictError('SKU already in use by another product');
      }
    }

    Object.assign(product, data);
    await product.save();
    return product;
  }

  /**
   * Soft delete a product (admin)
   */
  static async deleteProduct(slug: string): Promise<void> {
    const product = await Product.findOne({ slug });
    if (!product) {
      throw new NotFoundError('Product', 'RES_002');
    }

    product.isActive = false;
    await product.save();
  }

  /**
   * Update stock for a specific variant
   */
  static async updateStock(
    productId: string,
    variantSku: string,
    quantity: number,
    operation: 'set' | 'increment' | 'decrement' = 'set'
  ): Promise<IProduct> {
    const product = await Product.findById(productId);
    if (!product) {
      throw new NotFoundError('Product', 'RES_002');
    }

    const variant = product.variants.find((v) => v.sku === variantSku);
    if (!variant) {
      throw new NotFoundError('Variant');
    }

    switch (operation) {
      case 'set':
        variant.stock = quantity;
        break;
      case 'increment':
        variant.stock += quantity;
        break;
      case 'decrement':
        if (variant.stock < quantity) {
          throw new BadRequestError(
            `Insufficient stock. Available: ${variant.stock}`,
            'BIZ_002'
          );
        }
        variant.stock -= quantity;
        break;
    }

    variant.isAvailable = variant.stock > 0;
    await product.save();
    return product;
  }

  /**
   * Deduct stock for multiple items (used during order creation).
   * Logs each deduction as an InventoryTransaction and emits low-stock
   * alerts via Socket.io when a variant falls below the threshold.
   */
  static async deductStock(
    items: Array<{ productId: string; variantSku: string; quantity: number }>,
    orderId?: string
  ): Promise<void> {
    const LOW_STOCK_THRESHOLD = 10;

    await Promise.all(
      items.map(async (item) => {
        // Fetch current stock before update for the audit log
        const before = await Product.findOne(
          { _id: item.productId, 'variants.sku': item.variantSku },
          { 'variants.$': 1, name: 1 }
        );

        const beforeStock = before?.variants[0]?.stock ?? 0;

        const result = await Product.updateOne(
          {
            _id: new mongoose.Types.ObjectId(item.productId),
            'variants.sku': item.variantSku,
            'variants.stock': { $gte: item.quantity },
          },
          {
            $inc: { 'variants.$.stock': -item.quantity },
          }
        );

        if (result.modifiedCount === 0) {
          throw new BadRequestError(
            `Insufficient stock for SKU: ${item.variantSku}`,
            'BIZ_002'
          );
        }

        const afterStock = beforeStock - item.quantity;

        // Log inventory transaction (fire-and-forget, non-critical)
        InventoryTransaction.create({
          productId: new mongoose.Types.ObjectId(item.productId),
          variantSku: item.variantSku,
          transactionType: 'remove',
          quantityChanged: -item.quantity,
          beforeStock,
          afterStock,
          reason: 'Order fulfillment',
          ...(orderId && { orderId: new mongoose.Types.ObjectId(orderId) }),
        }).catch((err: Error) => console.error('[InventoryTransaction] Failed to log deduction:', err));

        // Emit low-stock alert to admin dashboard
        if (afterStock <= LOW_STOCK_THRESHOLD) {
          getIO()?.to('admin-dashboard').emit('low-stock-alert', {
            productId: item.productId,
            productName: before?.name ?? 'Unknown',
            variantSku: item.variantSku,
            stock: afterStock,
            threshold: LOW_STOCK_THRESHOLD,
          });
        }
      })
    );
  }

  /**
   * Restock items (used on order cancellation).
   * Logs each restock as an InventoryTransaction.
   */
  static async restockItems(
    items: Array<{ productId: string; variantSku: string; quantity: number }>,
    orderId?: string
  ): Promise<void> {
    await Promise.all(
      items.map(async (item) => {
        const before = await Product.findOne(
          { _id: item.productId, 'variants.sku': item.variantSku },
          { 'variants.$': 1 }
        );

        const beforeStock = before?.variants[0]?.stock ?? 0;

        await Product.updateOne(
          {
            _id: new mongoose.Types.ObjectId(item.productId),
            'variants.sku': item.variantSku,
          },
          { $inc: { 'variants.$.stock': item.quantity } }
        );

        const afterStock = beforeStock + item.quantity;

        // Log inventory transaction (fire-and-forget)
        InventoryTransaction.create({
          productId: new mongoose.Types.ObjectId(item.productId),
          variantSku: item.variantSku,
          transactionType: 'return',
          quantityChanged: item.quantity,
          beforeStock,
          afterStock,
          reason: 'Order cancellation restock',
          ...(orderId && { orderId: new mongoose.Types.ObjectId(orderId) }),
        }).catch((err: Error) => console.error('[InventoryTransaction] Failed to log restock:', err));
      })
    );
  }

  /**
   * Validate that all items in a list are in stock
   */
  static async validateStock(
    items: Array<{ productId: string; variantSku: string; quantity: number }>
  ): Promise<void> {
    for (const item of items) {
      const product = await Product.findOne({
        _id: item.productId,
        isActive: true,
        variants: {
          $elemMatch: {
            sku: item.variantSku,
            stock: { $gte: item.quantity },
            isAvailable: true,
          },
        },
      });

      if (!product) {
        throw new BadRequestError(
          `Product/variant unavailable or insufficient stock: ${item.variantSku}`,
          'BIZ_001'
        );
      }
    }
  }
}

export default ProductService;
