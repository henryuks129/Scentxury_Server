/**
 * ============================================
 * PRODUCT CONTROLLER
 * ============================================
 *
 * Handles all product-related HTTP requests.
 * Business logic lives in ProductService.
 *
 * @file src/controllers/product.controller.ts
 */

import { Request, Response, NextFunction } from 'express';
import { ProductService, type CreateProductData, type UpdateProductData } from '@services/product.service.js';
import { sendSuccess, sendCreated, sendNoContent, parsePaginationQuery } from '@utils/response.js';
import { BadRequestError } from '@utils/errors.js';

// ============================================
// GET PRODUCTS (Public)
// ============================================

export async function getProducts(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { page, limit } = parsePaginationQuery(req.query);
    const {
      category,
      scentFamily,
      brand,
      minPrice,
      maxPrice,
      inStock,
      isFeatured,
      sort,
      tags,
    } = req.query as Record<string, string>;

    const result = await ProductService.getProducts({
      page,
      limit,
      sort,
      filter: {
        category,
        scentFamily,
        brand,
        minPrice: minPrice ? Number(minPrice) : undefined,
        maxPrice: maxPrice ? Number(maxPrice) : undefined,
        inStock: inStock === 'true',
        isFeatured: isFeatured ? isFeatured === 'true' : undefined,
        tags: tags ? tags.split(',').map((t) => t.trim()) : undefined,
      },
    });

    res.json({
      success: true,
      message: 'Products retrieved successfully',
      data: {
        products: result.products,
        pagination: result.pagination,
      },
    });
  } catch (error) {
    next(error);
  }
}

// ============================================
// SEARCH PRODUCTS (Public)
// ============================================

export async function searchProducts(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { q, limit, category } = req.query as Record<string, string>;

    if (!q?.trim()) {
      throw new BadRequestError('Search query is required');
    }

    const products = await ProductService.searchProducts(
      q,
      limit ? Number(limit) : 20,
      category
    );

    res.json({
      success: true,
      message: 'Search results retrieved',
      data: { products, count: products.length },
    });
  } catch (error) {
    next(error);
  }
}

// ============================================
// GET FEATURED PRODUCTS (Public)
// ============================================

export async function getFeaturedProducts(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { limit } = req.query as Record<string, string>;
    const result = await ProductService.getFeaturedProducts(
      limit ? Number(limit) : 10
    );

    sendSuccess(res, 'Featured products retrieved', result);
  } catch (error) {
    next(error);
  }
}

// ============================================
// GET SINGLE PRODUCT (Public)
// ============================================

export async function getProduct(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { slug } = req.params as { slug: string };
    const product = await ProductService.getProductBySlug(slug);

    res.json({
      success: true,
      message: 'Product retrieved successfully',
      data: { product },
    });
  } catch (error) {
    next(error);
  }
}

// ============================================
// CREATE PRODUCT (Admin)
// ============================================

export async function createProduct(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const data = req.body as CreateProductData;

    // Basic validation — full Zod validation done by middleware
    if (!data.name || !data.category || !data.variants?.length) {
      throw new BadRequestError(
        'Missing required fields: name, category, variants'
      );
    }

    // SKU uniqueness validation
    if (data.variants.some((v) => !v.sku)) {
      throw new BadRequestError('All variants must have a SKU');
    }

    const product = await ProductService.createProduct(data);

    sendCreated(res, 'Product created successfully', { product });
  } catch (error) {
    next(error);
  }
}

// ============================================
// UPDATE PRODUCT (Admin)
// ============================================

export async function updateProduct(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { slug } = req.params as { slug: string };
    const data = req.body as UpdateProductData;

    const product = await ProductService.updateProduct(slug, data);

    sendSuccess(res, 'Product updated successfully', { product });
  } catch (error) {
    next(error);
  }
}

// ============================================
// DELETE PRODUCT (Admin — soft delete)
// ============================================

export async function deleteProduct(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { slug } = req.params as { slug: string };
    await ProductService.deleteProduct(slug);

    sendNoContent(res);
  } catch (error) {
    next(error);
  }
}

// ============================================
// UPDATE STOCK (Admin)
// ============================================

export async function updateStock(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { id } = req.params as { id: string };
    const {
      variantSku,
      quantity,
      operation = 'set',
    } = req.body as {
      variantSku: string;
      quantity: number;
      operation?: 'set' | 'increment' | 'decrement';
    };

    if (!variantSku || quantity === undefined) {
      throw new BadRequestError('variantSku and quantity are required');
    }

    const product = await ProductService.updateStock(id, variantSku, quantity, operation);

    sendSuccess(res, 'Stock updated successfully', { product });
  } catch (error) {
    next(error);
  }
}

// ============================================
// GET PRODUCTS BY CATEGORY (Public)
// ============================================

export async function getProductsByCategory(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { category } = req.params as { category: string };
    const { page, limit } = parsePaginationQuery(req.query);
    const { sort } = req.query as { sort?: string };

    const result = await ProductService.getProductsByCategory(category, {
      page,
      limit,
      sort,
    });

    res.json({
      success: true,
      message: `${category} products retrieved`,
      data: {
        products: result.products,
        pagination: result.pagination,
      },
    });
  } catch (error) {
    next(error);
  }
}
