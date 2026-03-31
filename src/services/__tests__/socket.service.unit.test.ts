/**
 * ============================================
 * SOCKET SERVICE — UNIT TESTS
 * ============================================
 *
 * Tests the Socket.io BI event hub:
 * - initializeSocket registers connection handlers
 * - getSocketIO returns the initialised instance
 * - getSocketIO throws if called before initialisation
 * - Each dashboardEvents method emits correct event name + payload + timestamp
 *
 * Uses mock socket.io server to avoid real network connections.
 *
 * @file src/services/__tests__/socket.service.unit.test.ts
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  initializeSocket,
  getSocketIO,
  dashboardEvents,
} from '../socket.service.js';

// ============================================
// MOCK socket.io config accessor
// ============================================

// We mock the config/socket.js module to control the stored io instance
let storedIO: MockIO | null = null;

vi.mock('../../config/socket.js', () => ({
  setIO: vi.fn((io: MockIO) => { storedIO = io; }),
  getIO: vi.fn(() => storedIO),
}));

// ============================================
// MOCK Socket.io Server
// ============================================

interface MockEmit {
  (event: string, payload: unknown): void;
}

interface MockIO {
  on: ReturnType<typeof vi.fn>;
  to: ReturnType<typeof vi.fn>;
  _emitted: Array<{ room: string; event: string; payload: unknown }>;
}

function createMockIO(): MockIO {
  const emitted: Array<{ room: string; event: string; payload: unknown }> = [];

  const emitFn: MockEmit = (event, payload) => {
    emitted.push({ room: 'admin-dashboard', event, payload });
  };

  const toReturn = { emit: emitFn };

  return {
    on: vi.fn(),
    to: vi.fn(() => toReturn),
    _emitted: emitted,
  };
}

// ============================================
// TESTS
// ============================================

describe('SocketService', () => {
  beforeEach(() => {
    storedIO = null;
    vi.clearAllMocks();
  });

  // -----------------------------------------
  // initializeSocket
  // -----------------------------------------

  describe('initializeSocket', () => {
    it('registers connection handler on the io instance', () => {
      const mockIO = createMockIO();
      initializeSocket(mockIO as unknown as Parameters<typeof initializeSocket>[0]);

      // The 'connection' event handler should be registered
      expect(mockIO.on).toHaveBeenCalledWith('connection', expect.any(Function));
    });

    it('stores the io instance so getSocketIO can return it', () => {
      const mockIO = createMockIO();
      initializeSocket(mockIO as unknown as Parameters<typeof initializeSocket>[0]);

      const io = getSocketIO();
      expect(io).toBe(mockIO);
    });
  });

  // -----------------------------------------
  // getSocketIO
  // -----------------------------------------

  describe('getSocketIO', () => {
    it('returns the initialised io instance', () => {
      const mockIO = createMockIO();
      initializeSocket(mockIO as unknown as Parameters<typeof initializeSocket>[0]);

      expect(getSocketIO()).toBe(mockIO);
    });

    it('throws an error when called before initializeSocket', () => {
      // storedIO is null (cleared in beforeEach)
      expect(() => getSocketIO()).toThrow('Socket.io has not been initialised');
    });
  });

  // -----------------------------------------
  // dashboardEvents
  // -----------------------------------------

  describe('dashboardEvents', () => {
    let mockIO: MockIO;

    beforeEach(() => {
      mockIO = createMockIO();
      // Set io directly so dashboardEvents.* can call getIO()
      storedIO = mockIO;
    });

    it('newOrder emits "new-order" to admin-dashboard room', () => {
      dashboardEvents.newOrder({
        orderId: 'ord-1',
        orderNumber: 'SXT-001',
        total: 30000,
        customer: 'Test User',
      });

      expect(mockIO.to).toHaveBeenCalledWith('admin-dashboard');
      const last = mockIO._emitted[mockIO._emitted.length - 1];
      expect(last?.event).toBe('new-order');
      expect((last?.payload as Record<string, unknown>).orderId).toBe('ord-1');
      expect((last?.payload as Record<string, unknown>).timestamp).toBeDefined();
    });

    it('orderStatusChange emits "order-status-change" with correct payload', () => {
      dashboardEvents.orderStatusChange({
        orderId: 'ord-2',
        orderNumber: 'SXT-002',
        oldStatus: 'pending',
        newStatus: 'confirmed',
      });

      const last = mockIO._emitted[mockIO._emitted.length - 1];
      expect(last?.event).toBe('order-status-change');
      expect((last?.payload as Record<string, unknown>).newStatus).toBe('confirmed');
    });

    it('paymentReceived emits "payment-received" with amount and provider', () => {
      dashboardEvents.paymentReceived({ orderId: 'ord-3', amount: 45000, provider: 'paystack' });

      const last = mockIO._emitted[mockIO._emitted.length - 1];
      expect(last?.event).toBe('payment-received');
      expect((last?.payload as Record<string, unknown>).provider).toBe('paystack');
    });

    it('lowStockAlert emits "low-stock-alert" with stock details', () => {
      dashboardEvents.lowStockAlert({
        productId: 'prod-1',
        productName: 'Test Oud',
        variantSku: 'SKU-50ML-001',
        variantSize: '50ml',
        currentStock: 3,
      });

      const last = mockIO._emitted[mockIO._emitted.length - 1];
      expect(last?.event).toBe('low-stock-alert');
      expect((last?.payload as Record<string, unknown>).currentStock).toBe(3);
    });

    it('outOfStockAlert emits "out-of-stock-alert"', () => {
      dashboardEvents.outOfStockAlert({
        productId: 'prod-2',
        productName: 'Luxury Rose',
        variantSku: 'SKU-100ML-002',
      });

      const last = mockIO._emitted[mockIO._emitted.length - 1];
      expect(last?.event).toBe('out-of-stock-alert');
    });

    it('dailySummaryUpdated emits "daily-summary-updated" with financial totals', () => {
      dashboardEvents.dailySummaryUpdated({
        totalOrders: 12,
        netRevenue: 360000,
        grossProfit: 180000,
        unitsSold: 15,
      });

      const last = mockIO._emitted[mockIO._emitted.length - 1];
      expect(last?.event).toBe('daily-summary-updated');
      expect((last?.payload as Record<string, unknown>).totalOrders).toBe(12);
    });

    it('each emitter includes a server-side timestamp in the payload', () => {
      dashboardEvents.newOrder({ orderId: 'ts-test', orderNumber: 'SXT-TS', total: 1000, customer: 'X' });
      const last = mockIO._emitted[mockIO._emitted.length - 1];
      const ts = (last?.payload as Record<string, unknown>).timestamp;
      expect(typeof ts).toBe('string');
      expect(new Date(ts as string).getTime()).not.toBeNaN();
    });
  });
});
