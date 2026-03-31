/**
 * ============================================
 * ORDER CONTROLLER — UNIT TESTS
 * ============================================
 *
 * Tests order and cart controller logic in isolation.
 * OrderService and CartService are fully mocked.
 *
 * @file src/controllers/__tests__/order.controller.unit.test.ts
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  createOrder,
  getMyOrders,
  getOrder,
  cancelOrder,
  getAdminOrders,
  updateOrderStatus,
  getCart,
  addToCart,
  updateCartItem,
  removeCartItem,
  clearCart,
  validateCart,
} from '../order.controller.js';
import { mockRequest, mockResponse } from '../../test/helpers.js';
import { NotFoundError, ForbiddenError } from '../../utils/errors.js';

// ============================================
// MOCKS
// ============================================

vi.mock('../../services/order.service.js', () => ({
  OrderService: {
    createOrder: vi.fn(),
    getUserOrders: vi.fn(),
    getOrderByNumber: vi.fn(),
    cancelOrder: vi.fn(),
    getAdminOrders: vi.fn(),
    updateOrderStatus: vi.fn(),
  },
}));

vi.mock('../../services/cart.service.js', () => ({
  CartService: {
    getCart: vi.fn(),
    getCartSummary: vi.fn(),
    addToCart: vi.fn(),
    updateQuantity: vi.fn(),
    removeFromCart: vi.fn(),
    clearCart: vi.fn(),
    validateCartItems: vi.fn(),
  },
}));

import { OrderService } from '../../services/order.service.js';
import { CartService } from '../../services/cart.service.js';

// ============================================
// FIXTURES
// ============================================

const userId = '64a1b2c3d4e5f6a7b8c9d001';
const adminId = '64a1b2c3d4e5f6a7b8c9d002';

const mockOrder = {
  _id: '64a1b2c3d4e5f6a7b8c9d010',
  orderNumber: 'CHI202601000001',
  userId,
  status: 'pending',
  paymentStatus: 'pending',
  total: 32000,
  items: [],
};

const mockPagination = {
  page: 1,
  limit: 20,
  total: 1,
  totalPages: 1,
  hasNextPage: false,
  hasPrevPage: false,
};

const authUser = { id: userId, role: 'user' as const };
const authAdmin = { id: adminId, role: 'admin' as const };

// ============================================
// ORDER TESTS
// ============================================

// Tests all order controller functions in isolation with mocked OrderService / CartService.
// Controllers are responsible for: authentication checks, body validation, delegating to services,
// and returning the correct HTTP status codes.
describe('Order Controller', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ============================================
  // CREATE ORDER
  // ============================================
  // POST /api/v1/orders — authenticated users only.
  // Controller validates presence of items[], paymentMethod, and shippingAddress
  // before delegating to OrderService.createOrder. Prices are always resolved from DB.
  describe('createOrder', () => {
    const validOrderBody = {
      items: [
        { productId: '64a1b2c3d4e5f6a7b8c9d0e1', variantSku: 'OUD-20ML', quantity: 1 },
      ],
      paymentMethod: 'paystack',
      shippingAddress: {
        recipientName: 'John Doe',
        phone: '+2348012345678',
        street: '123 Lagos St',
        city: 'Lagos',
        state: 'Lagos',
      },
    };

    // Happy path: valid body + authenticated user → 201 with order in data
    it('should create an order and return 201', async () => {
      vi.mocked(OrderService.createOrder).mockResolvedValue(mockOrder as any);

      const req = mockRequest({ body: validOrderBody, user: authUser });
      const res = mockResponse();
      const next = vi.fn();

      await createOrder(req as any, res as any, next);

      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: expect.objectContaining({ order: mockOrder }),
        })
      );
    });

    // Auth guard: no req.user → 401 UnauthorizedError before service is called
    it('should fail when not authenticated', async () => {
      const req = mockRequest({ body: validOrderBody, user: null });
      const res = mockResponse();
      const next = vi.fn();

      await createOrder(req as any, res as any, next);

      expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 401 }));
    });

    // Validation: items[] must not be empty; controller guards this explicitly
    it('should fail with empty items array', async () => {
      const req = mockRequest({ body: { ...validOrderBody, items: [] }, user: authUser });
      const res = mockResponse();
      const next = vi.fn();

      await createOrder(req as any, res as any, next);

      expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 400 }));
    });

    // Validation: paymentMethod is required; controller rejects missing value with 400
    it('should fail without payment method', async () => {
      const req = mockRequest({
        body: { ...validOrderBody, paymentMethod: undefined },
        user: authUser,
      });
      const res = mockResponse();
      const next = vi.fn();

      await createOrder(req as any, res as any, next);

      expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 400 }));
    });

    // Error propagation: service errors (stock, not found) must reach next() unmodified
    it('should propagate service errors to next', async () => {
      vi.mocked(OrderService.createOrder).mockRejectedValue(
        new Error('Insufficient stock')
      );

      const req = mockRequest({ body: validOrderBody, user: authUser });
      const res = mockResponse();
      const next = vi.fn();

      await createOrder(req as any, res as any, next);

      expect(next).toHaveBeenCalledWith(expect.any(Error));
    });
  });

  // ============================================
  // GET MY ORDERS
  // ============================================
  // GET /api/v1/orders — returns the authenticated user's own orders.
  // Pagination applied via page/limit query params.
  describe('getMyOrders', () => {
    // Happy path: service called with userId from req.user, returns paginated result
    it('should return user orders with pagination', async () => {
      vi.mocked(OrderService.getUserOrders).mockResolvedValue({
        orders: [mockOrder] as any,
        pagination: mockPagination,
      });

      const req = mockRequest({ query: { page: '1', limit: '20' }, user: authUser });
      const res = mockResponse();
      const next = vi.fn();

      await getMyOrders(req as any, res as any, next);

      expect(OrderService.getUserOrders).toHaveBeenCalledWith(
        userId,
        expect.objectContaining({ page: 1, limit: 20 })
      );
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ success: true })
      );
    });
  });

  // ============================================
  // GET SINGLE ORDER
  // ============================================
  // GET /api/v1/orders/:orderNumber — user sees own orders; admin sees any order.
  // The controller passes userId for ownership check or undefined for admin.
  describe('getOrder', () => {
    // Happy path: user fetches their own order — service gets userId for ownership enforcement
    it('should return order for owner', async () => {
      vi.mocked(OrderService.getOrderByNumber).mockResolvedValue(mockOrder as any);

      const req = mockRequest({
        params: { orderNumber: 'CHI202601000001' },
        user: authUser,
      });
      const res = mockResponse();
      const next = vi.fn();

      await getOrder(req as any, res as any, next);

      expect(OrderService.getOrderByNumber).toHaveBeenCalledWith(
        'CHI202601000001',
        userId
      );
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ success: true })
      );
    });

    // Admin access: admin role → userId NOT passed to service (no ownership check)
    it('admin should get any order without userId restriction', async () => {
      vi.mocked(OrderService.getOrderByNumber).mockResolvedValue(mockOrder as any);

      const req = mockRequest({
        params: { orderNumber: 'CHI202601000001' },
        user: authAdmin,
      });
      const res = mockResponse();
      const next = vi.fn();

      await getOrder(req as any, res as any, next);

      expect(OrderService.getOrderByNumber).toHaveBeenCalledWith(
        'CHI202601000001',
        undefined  // admin — no userId restriction
      );
    });

    // Not found: service throws NotFoundError → controller forwards to next()
    it('should pass through 404 for non-existent order', async () => {
      vi.mocked(OrderService.getOrderByNumber).mockRejectedValue(
        new NotFoundError('Order')
      );

      const req = mockRequest({
        params: { orderNumber: 'CHI999999' },
        user: authUser,
      });
      const res = mockResponse();
      const next = vi.fn();

      await getOrder(req as any, res as any, next);

      expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 404 }));
    });
  });

  // ============================================
  // CANCEL ORDER
  // ============================================
  // POST /api/v1/orders/:orderNumber/cancel — auth required.
  // User can cancel own pending/confirmed orders. Admin can cancel any non-delivered order.
  // Requires non-empty `reason` in request body.
  describe('cancelOrder', () => {
    // Happy path: reason provided → service called → cancelled order returned
    it('should cancel an order', async () => {
      vi.mocked(OrderService.cancelOrder).mockResolvedValue({
        ...mockOrder,
        status: 'cancelled',
      } as any);

      const req = mockRequest({
        params: { orderNumber: 'CHI202601000001' },
        body: { reason: 'Changed my mind' },
        user: authUser,
      });
      const res = mockResponse();
      const next = vi.fn();

      await cancelOrder(req as any, res as any, next);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ success: true })
      );
    });

    // Validation: reason must be non-empty string; empty/absent body → 400
    it('should fail without cancellation reason', async () => {
      const req = mockRequest({
        params: { orderNumber: 'CHI202601000001' },
        body: {},
        user: authUser,
      });
      const res = mockResponse();
      const next = vi.fn();

      await cancelOrder(req as any, res as any, next);

      expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 400 }));
    });
  });

  // ============================================
  // ADMIN: UPDATE ORDER STATUS
  // ============================================
  // PATCH /api/v1/orders/:orderNumber/status — admin only.
  // Status transitions are validated by OrderService.validateStatusTransition.
  // adminId is captured from req.user.id for the tracking history entry.
  describe('updateOrderStatus', () => {
    // Happy path: valid status + notes → service called with correct args → updated order
    it('should update order status', async () => {
      vi.mocked(OrderService.updateOrderStatus).mockResolvedValue({
        ...mockOrder,
        status: 'confirmed',
      } as any);

      const req = mockRequest({
        params: { orderNumber: 'CHI202601000001' },
        body: { status: 'confirmed', notes: 'Payment verified' },
        user: authAdmin,
      });
      const res = mockResponse();
      const next = vi.fn();

      await updateOrderStatus(req as any, res as any, next);

      expect(OrderService.updateOrderStatus).toHaveBeenCalledWith(
        'CHI202601000001',
        'confirmed',
        'Payment verified',
        adminId
      );
    });

    // Validation: status field is required; missing → 400 BadRequestError
    it('should fail without status field', async () => {
      const req = mockRequest({
        params: { orderNumber: 'CHI202601000001' },
        body: {},
        user: authAdmin,
      });
      const res = mockResponse();
      const next = vi.fn();

      await updateOrderStatus(req as any, res as any, next);

      expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 400 }));
    });
  });
});

// ============================================
// CART CONTROLLER TESTS
// ============================================

// Tests cart controller functions in isolation with mocked CartService.
// Cart controllers are co-located in order.controller.ts because the cart
// is part of the order pre-checkout flow. All cart routes require auth.
describe('Cart Controller', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const mockCart = {
    userId,
    items: [
      {
        productId: '64a1b2c3d4e5f6a7b8c9d0e1',
        productName: 'Oud Wood',
        variantSku: 'OUD-20ML',
        variantSize: '20ml',
        quantity: 2,
        priceNGN: 15000,
        priceUSD: 20,
        thumbnail: 'https://example.com/thumb.jpg',
        addedAt: new Date().toISOString(),
      },
    ],
    updatedAt: new Date().toISOString(),
  };

  // GET /api/v1/cart — returns CartSummary (totals + items) via CartService.getCartSummary
  describe('getCart', () => {
    // Happy path: service returns summary → controller wraps in standard 200 envelope
    it('should return cart summary', async () => {
      vi.mocked(CartService.getCartSummary).mockResolvedValue({
        itemCount: 2,
        uniqueItems: 1,
        subtotalNGN: 30000,
        subtotalUSD: 40,
        items: mockCart.items,
      });

      const req = mockRequest({ user: authUser });
      const res = mockResponse();
      const next = vi.fn();

      await getCart(req as any, res as any, next);

      expect(CartService.getCartSummary).toHaveBeenCalledWith(userId);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ success: true })
      );
    });
  });

  // POST /api/v1/cart/items — adds a product variant to the Redis cart.
  // Requires productId and variantSku in body; quantity defaults to 1.
  describe('addToCart', () => {
    // Happy path: correct body → CartService.addToCart called with correct args
    it('should add item to cart', async () => {
      vi.mocked(CartService.addToCart).mockResolvedValue(mockCart as any);

      const req = mockRequest({
        body: {
          productId: '64a1b2c3d4e5f6a7b8c9d0e1',
          variantSku: 'OUD-20ML',
          quantity: 2,
        },
        user: authUser,
      });
      const res = mockResponse();
      const next = vi.fn();

      await addToCart(req as any, res as any, next);

      expect(CartService.addToCart).toHaveBeenCalledWith(
        userId,
        '64a1b2c3d4e5f6a7b8c9d0e1',
        'OUD-20ML',
        2
      );
    });

    // Validation: productId is required; missing → 400 BadRequestError
    it('should fail without productId', async () => {
      const req = mockRequest({
        body: { variantSku: 'OUD-20ML', quantity: 1 },
        user: authUser,
      });
      const res = mockResponse();
      const next = vi.fn();

      await addToCart(req as any, res as any, next);

      expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 400 }));
    });
  });

  // PATCH /api/v1/cart/items/:sku — sets a specific item's quantity.
  // Setting quantity to 0 removes the item from the cart.
  describe('updateCartItem', () => {
    // Happy path: sku from params + quantity from body → service called correctly
    it('should update item quantity', async () => {
      vi.mocked(CartService.updateQuantity).mockResolvedValue(mockCart as any);

      const req = mockRequest({
        params: { sku: 'OUD-20ML' },
        body: { quantity: 3 },
        user: authUser,
      });
      const res = mockResponse();
      const next = vi.fn();

      await updateCartItem(req as any, res as any, next);

      expect(CartService.updateQuantity).toHaveBeenCalledWith(userId, 'OUD-20ML', 3);
    });
  });

  // DELETE /api/v1/cart/items/:sku — removes a single item from the cart.
  // Returns 204 No Content on success.
  describe('removeCartItem', () => {
    // Happy path: sku from route param → item removed → 204 returned
    it('should remove item and return 204', async () => {
      vi.mocked(CartService.removeFromCart).mockResolvedValue(mockCart as any);

      const req = mockRequest({
        params: { sku: 'OUD-20ML' },
        user: authUser,
      });
      const res = mockResponse();
      const next = vi.fn();

      await removeCartItem(req as any, res as any, next);

      expect(res.status).toHaveBeenCalledWith(204);
    });
  });

  // DELETE /api/v1/cart — deletes the entire Redis cart for the user.
  // Returns 204 No Content on success.
  describe('clearCart', () => {
    // Happy path: Redis key deleted → 204 returned
    it('should clear cart and return 204', async () => {
      vi.mocked(CartService.clearCart).mockResolvedValue(undefined);

      const req = mockRequest({ user: authUser });
      const res = mockResponse();
      const next = vi.fn();

      await clearCart(req as any, res as any, next);

      expect(CartService.clearCart).toHaveBeenCalledWith(userId);
      expect(res.status).toHaveBeenCalledWith(204);
    });
  });

  // POST /api/v1/cart/validate — re-validates all cart items against current DB stock.
  // Used pre-checkout to catch price changes and out-of-stock items.
  describe('validateCart', () => {
    // Happy path: all items in stock → { valid: true, issues: [] } returned
    it('should validate cart and return result', async () => {
      vi.mocked(CartService.validateCartItems).mockResolvedValue({
        valid: true,
        cart: mockCart as any,
        issues: [],
      });

      const req = mockRequest({ user: authUser });
      const res = mockResponse();
      const next = vi.fn();

      await validateCart(req as any, res as any, next);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ success: true })
      );
    });
  });
});
