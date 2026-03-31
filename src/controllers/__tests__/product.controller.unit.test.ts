/**
 * ============================================
 * PRODUCT CONTROLLER — UNIT TESTS
 * ============================================
 *
 * Tests controller logic in isolation.
 * ProductService and Product model are fully mocked.
 *
 * @file src/controllers/__tests__/product.controller.unit.test.ts
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  getProducts,
  getProduct,
  createProduct,
  updateProduct,
  deleteProduct,
  searchProducts,
  getFeaturedProducts,
  updateStock,
  getProductsByCategory,
} from '../product.controller.js';
import { mockRequest, mockResponse } from '../../test/helpers.js';
import { NotFoundError, BadRequestError } from '../../utils/errors.js';

// ============================================
// MOCKS
// ============================================

vi.mock('../../services/product.service.js', () => ({
  ProductService: {
    getProducts: vi.fn(),
    getProductBySlug: vi.fn(),
    createProduct: vi.fn(),
    updateProduct: vi.fn(),
    deleteProduct: vi.fn(),
    searchProducts: vi.fn(),
    getFeaturedProducts: vi.fn(),
    updateStock: vi.fn(),
    getProductsByCategory: vi.fn(),
  },
}));

import { ProductService } from '../../services/product.service.js';

// ============================================
// HELPERS
// ============================================

const mockPagination = {
  page: 1,
  limit: 20,
  total: 2,
  totalPages: 1,
  hasNextPage: false,
  hasPrevPage: false,
};

const mockProduct = {
  _id: '64a1b2c3d4e5f6a7b8c9d0e1',
  name: 'Oud Wood',
  slug: 'oud-wood',
  category: 'unisex',
  basePrice: 30000,
  scentFamily: 'woody',
  isActive: true,
};

// ============================================
// TEST SUITE
// ============================================

// Tests all product controller functions in isolation using mocked ProductService.
// The controller layer is responsible for: parsing query params, calling the service,
// returning correct HTTP status codes, and forwarding errors to next().
describe('Product Controller', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ============================================
  // GET PRODUCTS
  // ============================================
  // Verifies that GET /api/v1/products correctly parses query parameters,
  // passes filters/sort/pagination to ProductService, and returns 200 with
  // the standard { success, data: { products, pagination } } shape.
  describe('getProducts', () => {
    // Happy path: service returns products; controller wraps in standard envelope
    it('should return paginated products', async () => {
      vi.mocked(ProductService.getProducts).mockResolvedValue({
        products: [mockProduct, mockProduct] as any,
        pagination: mockPagination,
      });

      const req = mockRequest({ query: { page: '1', limit: '10' } });
      const res = mockResponse();
      const next = vi.fn();

      await getProducts(req as any, res as any, next);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: expect.objectContaining({
            products: expect.arrayContaining([expect.objectContaining({ name: 'Oud Wood' })]),
            pagination: expect.objectContaining({ total: 2 }),
          }),
        })
      );
      expect(next).not.toHaveBeenCalled();
    });

    // Filter forwarding: query string category must reach the service filter object
    it('should pass category filter to service', async () => {
      vi.mocked(ProductService.getProducts).mockResolvedValue({
        products: [],
        pagination: { ...mockPagination, total: 0 },
      });

      const req = mockRequest({ query: { category: 'male' } });
      const res = mockResponse();
      const next = vi.fn();

      await getProducts(req as any, res as any, next);

      expect(ProductService.getProducts).toHaveBeenCalledWith(
        expect.objectContaining({
          filter: expect.objectContaining({ category: 'male' }),
        })
      );
    });

    // Numeric coercion: minPrice/maxPrice arrive as strings from query, must be Number()'d
    it('should pass price range filter to service', async () => {
      vi.mocked(ProductService.getProducts).mockResolvedValue({
        products: [],
        pagination: { ...mockPagination, total: 0 },
      });

      const req = mockRequest({ query: { minPrice: '10000', maxPrice: '50000' } });
      const res = mockResponse();
      const next = vi.fn();

      await getProducts(req as any, res as any, next);

      expect(ProductService.getProducts).toHaveBeenCalledWith(
        expect.objectContaining({
          filter: expect.objectContaining({ minPrice: 10000, maxPrice: 50000 }),
        })
      );
    });

    // Scent family filter: string passthrough
    it('should pass scentFamily filter to service', async () => {
      vi.mocked(ProductService.getProducts).mockResolvedValue({
        products: [],
        pagination: { ...mockPagination, total: 0 },
      });

      const req = mockRequest({ query: { scentFamily: 'woody' } });
      const res = mockResponse();
      const next = vi.fn();

      await getProducts(req as any, res as any, next);

      expect(ProductService.getProducts).toHaveBeenCalledWith(
        expect.objectContaining({
          filter: expect.objectContaining({ scentFamily: 'woody' }),
        })
      );
    });

    // Sort forwarding: sort string must be passed through to service
    it('should pass sort option to service', async () => {
      vi.mocked(ProductService.getProducts).mockResolvedValue({
        products: [],
        pagination: { ...mockPagination, total: 0 },
      });

      const req = mockRequest({ query: { sort: 'price_asc' } });
      const res = mockResponse();
      const next = vi.fn();

      await getProducts(req as any, res as any, next);

      expect(ProductService.getProducts).toHaveBeenCalledWith(
        expect.objectContaining({ sort: 'price_asc' })
      );
    });

    // Error propagation: any service error must be forwarded to next(), not swallowed
    it('should call next on service error', async () => {
      const err = new Error('DB error');
      vi.mocked(ProductService.getProducts).mockRejectedValue(err);

      const req = mockRequest();
      const res = mockResponse();
      const next = vi.fn();

      await getProducts(req as any, res as any, next);

      expect(next).toHaveBeenCalledWith(err);
    });
  });

  // ============================================
  // GET SINGLE PRODUCT
  // ============================================
  // GET /api/v1/products/:slug — public endpoint.
  // Controller extracts the slug param and delegates to ProductService.getProductBySlug.
  describe('getProduct', () => {
    // Happy path: service returns the product document
    it('should return product by slug', async () => {
      vi.mocked(ProductService.getProductBySlug).mockResolvedValue(mockProduct as any);

      const req = mockRequest({ params: { slug: 'oud-wood' } });
      const res = mockResponse();
      const next = vi.fn();

      await getProduct(req as any, res as any, next);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: expect.objectContaining({
            product: expect.objectContaining({ slug: 'oud-wood' }),
          }),
        })
      );
    });

    // Error case: NotFoundError from service must surface as 404 via next()
    it('should call next with 404 for non-existent product', async () => {
      vi.mocked(ProductService.getProductBySlug).mockRejectedValue(
        new NotFoundError('Product')
      );

      const req = mockRequest({ params: { slug: 'non-existent' } });
      const res = mockResponse();
      const next = vi.fn();

      await getProduct(req as any, res as any, next);

      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({ statusCode: 404 })
      );
    });
  });

  // ============================================
  // SEARCH PRODUCTS
  // ============================================
  // GET /api/v1/products/search?q=<query> — public endpoint.
  // Controller validates that q is present, then delegates to ProductService.searchProducts.
  describe('searchProducts', () => {
    // Happy path: search returns matching products
    it('should search by text query', async () => {
      vi.mocked(ProductService.searchProducts).mockResolvedValue([mockProduct] as any);

      const req = mockRequest({ query: { q: 'oud wood' } });
      const res = mockResponse();
      const next = vi.fn();

      await searchProducts(req as any, res as any, next);

      expect(ProductService.searchProducts).toHaveBeenCalledWith('oud wood', 20, undefined);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: expect.objectContaining({ count: 1 }),
        })
      );
    });

    // Edge case: no matching products — should return 200 with empty array, not 404
    it('should return empty array when no results', async () => {
      vi.mocked(ProductService.searchProducts).mockResolvedValue([]);

      const req = mockRequest({ query: { q: 'nonexistent' } });
      const res = mockResponse();
      const next = vi.fn();

      await searchProducts(req as any, res as any, next);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ products: [], count: 0 }),
        })
      );
    });

    // Validation: missing q param must produce 400 BadRequestError, not 500
    it('should throw BadRequestError when query is missing', async () => {
      const req = mockRequest({ query: {} });
      const res = mockResponse();
      const next = vi.fn();

      await searchProducts(req as any, res as any, next);

      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({ statusCode: 400 })
      );
    });
  });

  // ============================================
  // CREATE PRODUCT (Admin)
  // ============================================
  // POST /api/v1/products — admin only.
  // Controller does basic field presence checks, then delegates to ProductService.createProduct.
  // Full Zod validation is done by validate(CreateProductSchema) middleware before the controller.
  describe('createProduct', () => {
    const validProduct = {
      name: 'New Fragrance',
      description: 'A luxurious scent',
      category: 'unisex',
      brand: 'Chi',
      scentFamily: 'woody',
      scentNotes: { top: ['bergamot'], middle: ['rose'], base: ['musk'] },
      images: { boxed: 'url1', bottle: 'url2', thumbnail: 'url3' },
      variants: [
        {
          sku: 'NEW-20ML',
          size: '20ml',
          priceNGN: 15000,
          priceUSD: 20,
          costPrice: 8000,
          stock: 50,
        },
      ],
    };

    // Happy path: valid body → service called → 201 Created response
    it('should create product successfully', async () => {
      vi.mocked(ProductService.createProduct).mockResolvedValue({
        _id: 'new-id',
        ...validProduct,
      } as any);

      const req = mockRequest({
        body: validProduct,
        user: { id: 'admin123', role: 'admin' },
      });
      const res = mockResponse();
      const next = vi.fn();

      await createProduct(req as any, res as any, next);

      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ success: true })
      );
    });

    // Validation: variant without SKU must be rejected by controller guard
    it('should call next with BadRequestError when SKU is missing', async () => {
      const req = mockRequest({
        body: { ...validProduct, variants: [{ size: '20ml', priceNGN: 15000 }] },
        user: { id: 'admin123', role: 'admin' },
      });
      const res = mockResponse();
      const next = vi.fn();

      await createProduct(req as any, res as any, next);

      expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 400 }));
    });

    // SKU conflict: service throws ConflictError when a duplicate SKU is detected
    it('should pass through conflict error from service', async () => {
      const { ConflictError } = await import('../../utils/errors.js');
      vi.mocked(ProductService.createProduct).mockRejectedValue(
        new ConflictError('SKU already exists: NEW-20ML')
      );

      const req = mockRequest({
        body: validProduct,
        user: { id: 'admin123', role: 'admin' },
      });
      const res = mockResponse();
      const next = vi.fn();

      await createProduct(req as any, res as any, next);

      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({ message: expect.stringContaining('SKU') })
      );
    });
  });

  // ============================================
  // UPDATE PRODUCT
  // ============================================
  // PATCH /api/v1/products/:slug — admin only.
  // Partial updates supported; Zod validate(UpdateProductSchema) middleware runs first.
  describe('updateProduct', () => {
    // Happy path: service returns updated product
    it('should update product successfully', async () => {
      vi.mocked(ProductService.updateProduct).mockResolvedValue({
        ...mockProduct,
        name: 'Updated Name',
      } as any);

      const req = mockRequest({
        params: { slug: 'oud-wood' },
        body: { name: 'Updated Name' },
        user: { id: 'admin123', role: 'admin' },
      });
      const res = mockResponse();
      const next = vi.fn();

      await updateProduct(req as any, res as any, next);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ success: true })
      );
    });
  });

  // ============================================
  // DELETE PRODUCT
  // ============================================
  // DELETE /api/v1/products/:slug — admin only, soft delete (sets isActive: false).
  // Must return 204 No Content on success.
  describe('deleteProduct', () => {
    // Happy path: service resolves void → controller returns 204
    it('should soft-delete product and return 204', async () => {
      vi.mocked(ProductService.deleteProduct).mockResolvedValue(undefined);

      const req = mockRequest({
        params: { slug: 'oud-wood' },
        user: { id: 'admin123', role: 'admin' },
      });
      const res = mockResponse();
      const next = vi.fn();

      await deleteProduct(req as any, res as any, next);

      expect(res.status).toHaveBeenCalledWith(204);
    });
  });

  // ============================================
  // UPDATE STOCK
  // ============================================
  // PATCH /api/v1/products/:id/stock — admin only.
  // Accepts { variantSku, quantity, operation } in request body.
  // operation defaults to 'set'; allowed values: 'set' | 'increment' | 'decrement'.
  describe('updateStock', () => {
    // Happy path: all required fields present → service called with correct args
    it('should update stock successfully', async () => {
      vi.mocked(ProductService.updateStock).mockResolvedValue(mockProduct as any);

      const req = mockRequest({
        params: { id: '64a1b2c3d4e5f6a7b8c9d0e1' },
        body: { variantSku: 'OUD-20ML', quantity: 100, operation: 'set' },
        user: { id: 'admin123', role: 'admin' },
      });
      const res = mockResponse();
      const next = vi.fn();

      await updateStock(req as any, res as any, next);

      expect(ProductService.updateStock).toHaveBeenCalledWith(
        '64a1b2c3d4e5f6a7b8c9d0e1',
        'OUD-20ML',
        100,
        'set'
      );
    });

    // Validation: missing required body fields must produce 400, not a crash
    it('should require variantSku and quantity', async () => {
      const req = mockRequest({
        params: { id: '64a1b2c3d4e5f6a7b8c9d0e1' },
        body: {},
        user: { id: 'admin123', role: 'admin' },
      });
      const res = mockResponse();
      const next = vi.fn();

      await updateStock(req as any, res as any, next);

      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({ statusCode: 400 })
      );
    });
  });

  // ============================================
  // GET PRODUCTS BY CATEGORY
  // ============================================
  // GET /api/v1/products/category/:category — public endpoint.
  // Delegates to ProductService.getProductsByCategory with pagination options.
  describe('getProductsByCategory', () => {
    // Happy path: category param extracted from route, results returned in standard envelope
    it('should return products for a category', async () => {
      vi.mocked(ProductService.getProductsByCategory).mockResolvedValue({
        products: [mockProduct] as any,
        pagination: mockPagination,
      });

      const req = mockRequest({ params: { category: 'male' } });
      const res = mockResponse();
      const next = vi.fn();

      await getProductsByCategory(req as any, res as any, next);

      expect(ProductService.getProductsByCategory).toHaveBeenCalledWith(
        'male',
        expect.any(Object)
      );
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ success: true })
      );
    });
  });

  // ============================================
  // GET FEATURED
  // ============================================
  // GET /api/v1/products/featured — public endpoint.
  // Returns { featured: IProduct[], newArrivals: IProduct[] }.
  // limit query param defaults to 10 if not provided.
  describe('getFeaturedProducts', () => {
    // Happy path: limit parsed from query → service called → both arrays returned
    it('should return featured and new arrivals', async () => {
      vi.mocked(ProductService.getFeaturedProducts).mockResolvedValue({
        featured: [mockProduct] as any,
        newArrivals: [mockProduct] as any,
      });

      const req = mockRequest({ query: { limit: '5' } });
      const res = mockResponse();
      const next = vi.fn();

      await getFeaturedProducts(req as any, res as any, next);

      expect(ProductService.getFeaturedProducts).toHaveBeenCalledWith(5);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ success: true })
      );
    });
  });
});
