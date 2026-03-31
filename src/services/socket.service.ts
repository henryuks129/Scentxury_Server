/**
 * ============================================
 * SOCKET SERVICE — Real-time BI Event Hub
 * ============================================
 *
 * Central typed emitter for the Admin BI Dashboard.
 * Wraps raw socket.io calls with domain-specific typed methods.
 *
 * Usage:
 *   import { dashboardEvents } from '@services/socket.service.js';
 *   dashboardEvents.newOrder({ orderId, orderNumber, total, customer });
 *
 * @file src/services/socket.service.ts
 */

import type { Server as SocketIOServer } from 'socket.io';
import { setIO, getIO } from '@config/socket.js';

// ============================================
// EVENT PAYLOAD TYPES
// ============================================

export interface NewOrderPayload {
  orderId: string;
  orderNumber: string;
  total: number;
  customer: string;
}

export interface OrderStatusChangePayload {
  orderId: string;
  orderNumber: string;
  oldStatus: string;
  newStatus: string;
}

export interface PaymentReceivedPayload {
  orderId: string;
  amount: number;
  provider: string;
}

export interface LowStockAlertPayload {
  productId: string;
  productName: string;
  variantSku: string;
  variantSize: string;
  currentStock: number;
}

export interface OutOfStockAlertPayload {
  productId: string;
  productName: string;
  variantSku: string;
}

export interface DailySummaryUpdatedPayload {
  totalOrders: number;
  netRevenue: number;
  grossProfit: number;
  unitsSold: number;
}

// ============================================
// SOCKET SERVICE CLASS
// ============================================

/**
 * Initialise Socket.io event handlers.
 * Called once in app.ts after the io server is created.
 */
export function initializeSocket(socketIO: SocketIOServer): void {
  // Register io so all services can emit events
  setIO(socketIO);

  socketIO.on('connection', (socket) => {
    console.log(`🔌 [SocketService] Client connected: ${socket.id}`);

    // Admin joins the BI dashboard room to receive live updates
    socket.on('join:admin', () => {
      socket.join('admin-dashboard');
      console.log(`📊 [SocketService] Admin joined dashboard: ${socket.id}`);
    });

    socket.on('disconnect', () => {
      console.log(`🔌 [SocketService] Client disconnected: ${socket.id}`);
    });
  });
}

/**
 * Retrieve the initialised Socket.io instance.
 * Throws if called before initializeSocket().
 */
export function getSocketIO(): SocketIOServer {
  const io = getIO();
  if (!io) {
    throw new Error('[SocketService] Socket.io has not been initialised. Call initializeSocket() first.');
  }
  return io;
}

// ============================================
// TYPED DASHBOARD EVENT EMITTERS
// ============================================

/**
 * Typed emitters for the admin-dashboard room.
 * All events include a server-side timestamp.
 */
export const dashboardEvents = {
  /**
   * Emit when a new order is placed.
   * Front-end: increments live order counter.
   */
  newOrder(payload: NewOrderPayload): void {
    const io = getIO();
    if (!io) return; // graceful no-op if socket not initialised (e.g. in tests)
    io.to('admin-dashboard').emit('new-order', {
      ...payload,
      timestamp: new Date().toISOString(),
    });
  },

  /**
   * Emit when an order status changes (e.g. pending → confirmed).
   */
  orderStatusChange(payload: OrderStatusChangePayload): void {
    const io = getIO();
    if (!io) return;
    io.to('admin-dashboard').emit('order-status-change', {
      ...payload,
      timestamp: new Date().toISOString(),
    });
  },

  /**
   * Emit when a payment is confirmed (Paystack / Stripe webhook).
   */
  paymentReceived(payload: PaymentReceivedPayload): void {
    const io = getIO();
    if (!io) return;
    io.to('admin-dashboard').emit('payment-received', {
      ...payload,
      timestamp: new Date().toISOString(),
    });
  },

  /**
   * Emit when a variant stock falls to or below the low-stock threshold.
   */
  lowStockAlert(payload: LowStockAlertPayload): void {
    const io = getIO();
    if (!io) return;
    io.to('admin-dashboard').emit('low-stock-alert', {
      ...payload,
      timestamp: new Date().toISOString(),
    });
  },

  /**
   * Emit when a variant sells out completely.
   */
  outOfStockAlert(payload: OutOfStockAlertPayload): void {
    const io = getIO();
    if (!io) return;
    io.to('admin-dashboard').emit('out-of-stock-alert', {
      ...payload,
      timestamp: new Date().toISOString(),
    });
  },

  /**
   * Emit after daily summary is recalculated (cron or on-demand).
   */
  dailySummaryUpdated(payload: DailySummaryUpdatedPayload): void {
    const io = getIO();
    if (!io) return;
    io.to('admin-dashboard').emit('daily-summary-updated', {
      ...payload,
      timestamp: new Date().toISOString(),
    });
  },
};
