/**
 * ============================================
 * ORDER CONTROLLER
 * ============================================
 *
 * Handles order and cart HTTP requests.
 * Business logic lives in OrderService / CartService.
 *
 * @file src/controllers/order.controller.ts
 */

import { Request, Response, NextFunction } from 'express';
import { OrderService, type CreateOrderData } from '@services/order.service.js';
import { CartService } from '@services/cart.service.js';
import { sendSuccess, sendCreated, sendNoContent, parsePaginationQuery } from '@utils/response.js';
import { BadRequestError, UnauthorizedError } from '@utils/errors.js';
import type { OrderStatus } from '@models/Order.js';

// ============================================
// HELPERS
// ============================================

function requireUserId(req: Request): string {
  const userId = (req as Request & { user?: { id: string } }).user?.id;
  if (!userId) throw new UnauthorizedError('Authentication required');
  return userId;
}

function isAdmin(req: Request): boolean {
  return (req as Request & { user?: { role: string } }).user?.role === 'admin';
}

// ============================================
// ORDER CONTROLLERS
// ============================================

/**
 * POST /api/v1/orders
 * Create a new order (authenticated users)
 */
export async function createOrder(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const userId = requireUserId(req);
    const data = req.body as CreateOrderData;

    if (!data.items?.length) {
      throw new BadRequestError('Order must contain at least one item');
    }
    if (!data.paymentMethod) {
      throw new BadRequestError('Payment method is required');
    }
    if (!data.shippingAddress) {
      throw new BadRequestError('Shipping address is required');
    }

    const order = await OrderService.createOrder(userId, data);

    sendCreated(res, 'Order created successfully', { order });
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/v1/orders
 * Get authenticated user's orders (paginated)
 */
export async function getMyOrders(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const userId = requireUserId(req);
    const { page, limit } = parsePaginationQuery(req.query);
    const { status } = req.query as { status?: string };

    const result = await OrderService.getUserOrders(userId, { page, limit, status });

    res.json({
      success: true,
      message: 'Orders retrieved successfully',
      data: {
        orders: result.orders,
        pagination: result.pagination,
      },
    });
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/v1/orders/:orderNumber
 * Get single order (user gets own, admin gets any)
 */
export async function getOrder(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { orderNumber } = req.params as { orderNumber: string };
    const userId = requireUserId(req);
    const admin = isAdmin(req);

    const order = await OrderService.getOrderByNumber(
      orderNumber,
      admin ? undefined : userId
    );

    sendSuccess(res, 'Order retrieved successfully', { order });
  } catch (error) {
    next(error);
  }
}

/**
 * POST /api/v1/orders/:orderNumber/cancel
 * Cancel an order (user cancels own, admin cancels any)
 */
export async function cancelOrder(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { orderNumber } = req.params as { orderNumber: string };
    const userId = requireUserId(req);
    const admin = isAdmin(req);

    const { reason } = req.body as { reason?: string };
    if (!reason?.trim()) {
      throw new BadRequestError('Cancellation reason is required');
    }

    const order = await OrderService.cancelOrder(orderNumber, userId, reason, admin);

    sendSuccess(res, 'Order cancelled successfully', { order });
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/v1/orders/admin
 * Admin: Get all orders with filters
 */
export async function getAdminOrders(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { page, limit } = parsePaginationQuery(req.query);
    const {
      status,
      paymentStatus,
      startDate,
      endDate,
      search,
      sort,
    } = req.query as Record<string, string>;

    const result = await OrderService.getAdminOrders({
      page,
      limit,
      status: status as OrderStatus | undefined,
      paymentStatus,
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: endDate ? new Date(endDate) : undefined,
      search,
      sort,
    });

    res.json({
      success: true,
      message: 'Orders retrieved successfully',
      data: {
        orders: result.orders,
        pagination: result.pagination,
      },
    });
  } catch (error) {
    next(error);
  }
}

/**
 * PATCH /api/v1/orders/:orderNumber/status
 * Admin: Update order status
 */
export async function updateOrderStatus(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { orderNumber } = req.params as { orderNumber: string };
    const adminId = requireUserId(req);
    const { status, notes } = req.body as { status: OrderStatus; notes?: string };

    if (!status) {
      throw new BadRequestError('Status is required');
    }

    const order = await OrderService.updateOrderStatus(
      orderNumber,
      status,
      notes,
      adminId
    );

    sendSuccess(res, 'Order status updated successfully', { order });
  } catch (error) {
    next(error);
  }
}

// ============================================
// CART CONTROLLERS
// ============================================

/**
 * GET /api/v1/cart
 * Get current user's cart
 */
export async function getCart(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const userId = requireUserId(req);
    const summary = await CartService.getCartSummary(userId);

    sendSuccess(res, 'Cart retrieved successfully', summary);
  } catch (error) {
    next(error);
  }
}

/**
 * POST /api/v1/cart/items
 * Add item to cart
 */
export async function addToCart(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const userId = requireUserId(req);
    const { productId, variantSku, quantity = 1 } = req.body as {
      productId: string;
      variantSku: string;
      quantity?: number;
    };

    if (!productId || !variantSku) {
      throw new BadRequestError('productId and variantSku are required');
    }

    const cart = await CartService.addToCart(userId, productId, variantSku, quantity);

    sendSuccess(res, 'Item added to cart', { cart });
  } catch (error) {
    next(error);
  }
}

/**
 * PATCH /api/v1/cart/items/:sku
 * Update item quantity in cart
 */
export async function updateCartItem(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const userId = requireUserId(req);
    const { sku } = req.params as { sku: string };
    const { quantity } = req.body as { quantity: number };

    if (quantity === undefined) {
      throw new BadRequestError('quantity is required');
    }

    const cart = await CartService.updateQuantity(userId, sku, quantity);

    sendSuccess(res, 'Cart updated successfully', { cart });
  } catch (error) {
    next(error);
  }
}

/**
 * DELETE /api/v1/cart/items/:sku
 * Remove item from cart
 */
export async function removeCartItem(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const userId = requireUserId(req);
    const { sku } = req.params as { sku: string };

    await CartService.removeFromCart(userId, sku);

    sendNoContent(res);
  } catch (error) {
    next(error);
  }
}

/**
 * DELETE /api/v1/cart
 * Clear entire cart
 */
export async function clearCart(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const userId = requireUserId(req);
    await CartService.clearCart(userId);

    sendNoContent(res);
  } catch (error) {
    next(error);
  }
}

/**
 * POST /api/v1/cart/merge
 * Merge a guest cart (localStorage) into the authenticated user's cart.
 * Called by the frontend immediately after login.
 */
export async function mergeGuestCart(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const userId = requireUserId(req);
    const { items } = req.body as {
      items: Array<{ productId: string; variantSku: string; quantity: number }>;
    };

    if (!Array.isArray(items) || items.length === 0) {
      throw new BadRequestError('items must be a non-empty array');
    }

    const result = await CartService.mergeGuestCart(userId, items);

    sendSuccess(res, `Merged ${result.merged} item(s) into cart`, result);
  } catch (error) {
    next(error);
  }
}

/**
 * POST /api/v1/cart/validate
 * Validate cart before checkout
 */
export async function validateCart(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const userId = requireUserId(req);
    const result = await CartService.validateCartItems(userId);

    sendSuccess(res, result.valid ? 'Cart is valid' : 'Cart updated — some items changed', result);
  } catch (error) {
    next(error);
  }
}
