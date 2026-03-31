/**
 * ============================================
 * CART SERVICE
 * ============================================
 *
 * Redis-backed shopping cart.
 * Cart is scoped per user — TTL: 7 days.
 * Cart items reference product+variant; prices
 * are resolved fresh at checkout validation.
 *
 * @file src/services/cart.service.ts
 */

import { redisClient } from '@config/redis.js';
import { Product } from '@models/Product.js';
import { BadRequestError, NotFoundError } from '@utils/errors.js';

// ============================================
// TYPES
// ============================================

export interface CartItem {
  productId: string;
  productName: string;
  variantSku: string;
  variantSize: '20ml' | '50ml' | '100ml';
  quantity: number;
  priceNGN: number;
  priceUSD: number;
  thumbnail: string;
  addedAt: string;
}

export interface Cart {
  userId: string;
  items: CartItem[];
  updatedAt: string;
}

export interface CartSummary {
  itemCount: number;
  uniqueItems: number;
  subtotalNGN: number;
  subtotalUSD: number;
  items: CartItem[];
}

// ============================================
// CONSTANTS
// ============================================

const CART_TTL = 7 * 24 * 60 * 60; // 7 days in seconds
const CART_MAX_ITEMS = 20;

// ============================================
// HELPERS
// ============================================

function cartKey(userId: string): string {
  return `cart:${userId}`;
}

async function loadCart(userId: string): Promise<Cart> {
  const raw = await redisClient.get(cartKey(userId));
  if (!raw) {
    return { userId, items: [], updatedAt: new Date().toISOString() };
  }
  return JSON.parse(raw) as Cart;
}

async function saveCart(cart: Cart): Promise<void> {
  cart.updatedAt = new Date().toISOString();
  await redisClient.setex(cartKey(cart.userId), CART_TTL, JSON.stringify(cart));
}

// ============================================
// CART SERVICE
// ============================================

export class CartService {
  /**
   * Get the current cart for a user
   */
  static async getCart(userId: string): Promise<Cart> {
    return loadCart(userId);
  }

  /**
   * Add an item to the cart.
   * If the same SKU is already in the cart, quantity is incremented.
   */
  static async addToCart(
    userId: string,
    productId: string,
    variantSku: string,
    quantity: number
  ): Promise<Cart> {
    if (quantity < 1) {
      throw new BadRequestError('Quantity must be at least 1');
    }

    // Resolve product/variant from DB
    const product = await Product.findOne({ _id: productId, isActive: true });
    if (!product) {
      throw new NotFoundError('Product', 'RES_002');
    }

    const variant = product.variants.find((v) => v.sku === variantSku);
    if (!variant) {
      throw new NotFoundError('Variant');
    }

    if (!variant.isAvailable) {
      throw new BadRequestError('Variant is not available', 'BIZ_001');
    }

    const cart = await loadCart(userId);

    // Check cart size limit
    const existing = cart.items.find((i) => i.variantSku === variantSku);
    if (!existing && cart.items.length >= CART_MAX_ITEMS) {
      throw new BadRequestError(
        `Cart limit reached. Maximum ${CART_MAX_ITEMS} unique items.`
      );
    }

    const newQty = (existing?.quantity ?? 0) + quantity;

    // Validate stock
    if (variant.stock < newQty) {
      throw new BadRequestError(
        `Insufficient stock. Available: ${variant.stock}`,
        'BIZ_002'
      );
    }

    if (existing) {
      existing.quantity = newQty;
    } else {
      cart.items.push({
        productId: product._id.toString(),
        productName: product.name,
        variantSku: variant.sku,
        variantSize: variant.size,
        quantity,
        priceNGN: variant.priceNGN,
        priceUSD: variant.priceUSD,
        thumbnail: product.images.thumbnail,
        addedAt: new Date().toISOString(),
      });
    }

    await saveCart(cart);
    return cart;
  }

  /**
   * Remove a single item from the cart by SKU
   */
  static async removeFromCart(userId: string, variantSku: string): Promise<Cart> {
    const cart = await loadCart(userId);
    const before = cart.items.length;
    cart.items = cart.items.filter((i) => i.variantSku !== variantSku);

    if (cart.items.length === before) {
      throw new NotFoundError('Cart item');
    }

    await saveCart(cart);
    return cart;
  }

  /**
   * Update item quantity (set to 0 removes the item)
   */
  static async updateQuantity(
    userId: string,
    variantSku: string,
    quantity: number
  ): Promise<Cart> {
    if (quantity < 0) {
      throw new BadRequestError('Quantity cannot be negative');
    }

    const cart = await loadCart(userId);
    const item = cart.items.find((i) => i.variantSku === variantSku);

    if (!item) {
      throw new NotFoundError('Cart item');
    }

    if (quantity === 0) {
      cart.items = cart.items.filter((i) => i.variantSku !== variantSku);
    } else {
      // Validate current stock
      const product = await Product.findOne({ _id: item.productId });
      const variant = product?.variants.find((v) => v.sku === variantSku);

      if (variant && variant.stock < quantity) {
        throw new BadRequestError(
          `Insufficient stock. Available: ${variant.stock}`,
          'BIZ_002'
        );
      }

      item.quantity = quantity;
    }

    await saveCart(cart);
    return cart;
  }

  /**
   * Clear all items from the cart
   */
  static async clearCart(userId: string): Promise<void> {
    await redisClient.del(cartKey(userId));
  }

  /**
   * Validate all cart items are still in stock.
   * Updates prices to reflect current DB values.
   * Returns validation result with any issues found.
   */
  static async validateCartItems(userId: string): Promise<{
    valid: boolean;
    cart: Cart;
    issues: Array<{ variantSku: string; issue: string }>;
  }> {
    const cart = await loadCart(userId);
    const issues: Array<{ variantSku: string; issue: string }> = [];

    for (const item of cart.items) {
      const product = await Product.findOne({
        _id: item.productId,
        isActive: true,
      });

      if (!product) {
        issues.push({ variantSku: item.variantSku, issue: 'Product no longer available' });
        continue;
      }

      const variant = product.variants.find((v) => v.sku === item.variantSku);

      if (!variant || !variant.isAvailable) {
        issues.push({ variantSku: item.variantSku, issue: 'Variant no longer available' });
        continue;
      }

      if (variant.stock < item.quantity) {
        if (variant.stock === 0) {
          issues.push({ variantSku: item.variantSku, issue: 'Out of stock' });
        } else {
          // Adjust quantity to available stock
          item.quantity = variant.stock;
          issues.push({
            variantSku: item.variantSku,
            issue: `Quantity adjusted to available stock: ${variant.stock}`,
          });
        }
      }

      // Refresh prices from DB
      item.priceNGN = variant.priceNGN;
      item.priceUSD = variant.priceUSD;
    }

    // Remove unavailable items
    cart.items = cart.items.filter(
      (item) =>
        !issues.some(
          (i) =>
            i.variantSku === item.variantSku &&
            (i.issue.includes('no longer') || i.issue === 'Out of stock')
        )
    );

    if (issues.length > 0) {
      await saveCart(cart);
    }

    return {
      valid: issues.length === 0,
      cart,
      issues,
    };
  }

  /**
   * Merge a guest cart (from frontend localStorage) into the user's Redis cart.
   * Each item is added using the same addToCart logic — if stock is insufficient
   * or the product is unavailable, the item is skipped and reported.
   * Existing cart items are preserved; quantities accumulate.
   */
  static async mergeGuestCart(
    userId: string,
    guestItems: Array<{ productId: string; variantSku: string; quantity: number }>
  ): Promise<{
    cart: Cart;
    merged: number;
    skipped: Array<{ variantSku: string; reason: string }>;
  }> {
    const skipped: Array<{ variantSku: string; reason: string }> = [];
    let merged = 0;

    for (const item of guestItems) {
      try {
        await CartService.addToCart(userId, item.productId, item.variantSku, item.quantity);
        merged++;
      } catch (err) {
        skipped.push({
          variantSku: item.variantSku,
          reason: err instanceof Error ? err.message : 'Unknown error',
        });
      }
    }

    const cart = await loadCart(userId);
    return { cart, merged, skipped };
  }

  /**
   * Get cart summary (totals, item count)
   */
  static async getCartSummary(userId: string): Promise<CartSummary> {
    const cart = await loadCart(userId);

    const subtotalNGN = cart.items.reduce(
      (sum, i) => sum + i.priceNGN * i.quantity,
      0
    );
    const subtotalUSD = cart.items.reduce(
      (sum, i) => sum + i.priceUSD * i.quantity,
      0
    );
    const itemCount = cart.items.reduce((sum, i) => sum + i.quantity, 0);

    return {
      itemCount,
      uniqueItems: cart.items.length,
      subtotalNGN,
      subtotalUSD,
      items: cart.items,
    };
  }
}

export default CartService;
