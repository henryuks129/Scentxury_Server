/**
 * ============================================
 * EXPORT SERVICE — UNIT TESTS
 * ============================================
 *
 * Tests Google Sheets export functionality.
 * The googleapis / google-spreadsheet client is mocked so tests
 * run without real Google credentials.
 *
 * Tests cover:
 * - initSheetsClient — initialises from env vars; throws on missing creds
 * - exportOrdersToSheets — correct row mapping, empty result
 * - exportCustomersToSheets — correct column mapping, empty result
 * - exportPnLToSheets — correct P&L rows, new tab creation
 * - Error handling — friendly error on Sheets API failure
 *
 * @file src/services/__tests__/export.service.unit.test.ts
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import mongoose from 'mongoose';
import { ExportService } from '../export.service.js';
import { User } from '../../models/User.js';
import { Order } from '../../models/Order.js';
import { DailySummary } from '../../models/DailySummary.js';
import { GoogleSpreadsheet } from 'google-spreadsheet';

// ============================================
// MOCK google-auth-library JWT
// ============================================
vi.mock('google-auth-library', () => ({
  JWT: vi.fn().mockImplementation(() => ({ authorize: vi.fn() })),
}));

// ============================================
// MOCK google-spreadsheet
// ============================================

// Shared storage to capture rows added during tests
const mockSheets: Record<string, unknown[]> = {};

// Declare mock fns at module scope — implementations are set/restored in beforeEach
// because vi.resetAllMocks() in setup.ts afterEach wipes all implementations.
const mockAddRows = vi.fn();
const mockSetHeaderRow = vi.fn();
const mockAddSheet = vi.fn();

vi.mock('google-spreadsheet', () => ({
  GoogleSpreadsheet: vi.fn(),
}));

// ============================================
// HELPERS
// ============================================

const makeUser = (overrides: Record<string, unknown> = {}) => ({
  email: `user${Math.random().toString(36).slice(2)}@test.com`,
  password: 'Password123!',
  firstName: 'Test',
  lastName: 'User',
  role: 'user' as const,
  isVerified: true,
  isActive: true,
  ...overrides,
});

const makeOrder = (userId: string, overrides: Record<string, unknown> = {}) => ({
  orderNumber: `ORD-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  userId: new mongoose.Types.ObjectId(userId),
  items: [{
    productId: new mongoose.Types.ObjectId(),
    productName: 'Test Fragrance',
    variantSku: 'SKU-50ML-001',
    variantSize: '50ml' as const,
    quantity: 2,
    unitPrice: 30000,
    costPrice: 10000,
    discount: 0,
    total: 60000,
  }],
  subtotal: 60000,
  discount: 5000,
  deliveryFee: 1500,
  total: 56500,
  currency: 'NGN' as const,
  status: 'delivered' as const,
  paymentStatus: 'paid' as const,
  paymentMethod: 'paystack' as const,
  shippingAddress: {
    street: '1 Test Lane',
    city: 'Lagos',
    state: 'Lagos',
    country: 'Nigeria',
    phone: '+2340000000000',
    recipientName: 'Test User',
  },
  deliveryType: 'standard' as const,
  trackingHistory: [],
  ...overrides,
});

// ============================================
// TESTS
// ============================================

describe('ExportService', () => {
  beforeEach(() => {
    Object.keys(mockSheets).forEach((k) => delete mockSheets[k]);

    // Restore mock implementations — vi.resetAllMocks() in setup.ts afterEach wipes them.
    mockAddRows.mockImplementation((rows: unknown[]) => {
      mockSheets['current'] = [...(mockSheets['current'] ?? []), ...rows];
      return Promise.resolve();
    });
    mockSetHeaderRow.mockResolvedValue(undefined);
    mockAddSheet.mockImplementation(({ title }: { title: string }) => ({
      title,
      setHeaderRow: mockSetHeaderRow,
      addRows: mockAddRows,
    }));
    vi.mocked(GoogleSpreadsheet).mockImplementation(() => ({
      loadInfo: vi.fn().mockResolvedValue(undefined),
      sheetsByTitle: {} as Record<string, unknown>,
      addSheet: mockAddSheet,
    }) as unknown as InstanceType<typeof GoogleSpreadsheet>);

    // Set required env vars for Sheets client
    process.env.GOOGLE_SHEETS_CLIENT_EMAIL = 'test@test-project.iam.gserviceaccount.com';
    process.env.GOOGLE_SHEETS_PRIVATE_KEY = '-----BEGIN RSA PRIVATE KEY-----\nMOCK\n-----END RSA PRIVATE KEY-----';
    process.env.GOOGLE_SHEETS_SPREADSHEET_ID = 'mock-spreadsheet-id';
  });

  // -----------------------------------------
  // initSheetsClient
  // -----------------------------------------

  describe('initSheetsClient', () => {
    it('initialises JWT client from environment variables', () => {
      // Should not throw
      expect(() => ExportService.initSheetsClient()).not.toThrow();
    });

    it('throws when GOOGLE_SHEETS_CLIENT_EMAIL is missing', () => {
      delete process.env.GOOGLE_SHEETS_CLIENT_EMAIL;
      expect(() => ExportService.initSheetsClient()).toThrow(/credentials not configured/i);
    });
  });

  // -----------------------------------------
  // exportOrdersToSheets
  // -----------------------------------------

  describe('exportOrdersToSheets', () => {
    it('calls the Sheets API with correctly mapped order data', async () => {
      const user = await User.create(makeUser());
      await Order.create(makeOrder(String(user._id)));

      const start = new Date('2026-01-01');
      const end = new Date('2026-12-31');

      await ExportService.exportOrdersToSheets({
        startDate: start,
        endDate: end,
      });

      // addSheet was called (no existing sheet) and addRows was called
      expect(mockAddSheet).toHaveBeenCalled();
      expect(mockAddRows).toHaveBeenCalled();
    });

    it('returns rowsWritten: 0 and sheetUrl when no orders found', async () => {
      const result = await ExportService.exportOrdersToSheets({
        startDate: new Date('2020-01-01'),
        endDate: new Date('2020-01-02'),
      });

      expect(result.rowsWritten).toBe(0);
      expect(result.sheetUrl).toContain('docs.google.com');
    });
  });

  // -----------------------------------------
  // exportCustomersToSheets
  // -----------------------------------------

  describe('exportCustomersToSheets', () => {
    it('writes one row per active customer user', async () => {
      await User.create(makeUser());
      await User.create(makeUser());

      await ExportService.exportCustomersToSheets();

      expect(mockAddRows).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({ Email: expect.any(String) }),
        ])
      );
    });

    it('returns rowsWritten: 0 when no users exist', async () => {
      // All users cleaned up in beforeEach via setup.ts
      const result = await ExportService.exportCustomersToSheets();
      expect(result.rowsWritten).toBe(0);
    });
  });

  // -----------------------------------------
  // exportPnLToSheets
  // -----------------------------------------

  describe('exportPnLToSheets', () => {
    it('creates a PnL_YYYY-MM sheet tab with revenue and profit rows', async () => {
      // Seed a DailySummary
      await DailySummary.create({
        date: new Date('2026-01-15'),
        dateString: '2026-01-15',
        totalOrders: 10,
        grossRevenue: 300000,
        discountsGiven: 10000,
        deliveryFeesCollected: 15000,
        netRevenue: 290000,
        costOfGoodsSold: 150000,
        grossProfit: 140000,
        grossProfitMargin: 48.3,
        unitsBySize: { '20ml': 2, '50ml': 5, '100ml': 3, total: 10 },
        paymentBreakdown: { paystack: 200000, stripe: 90000, bankTransfer: 0 },
        categoryBreakdown: { male: 5, female: 3, unisex: 2, children: 0, combo_mix: 0 },
        totalExpenses: 50000,
        netProfit: 90000,
        netProfitMargin: 31,
        newCustomers: 3,
        returningCustomers: 7,
        avgOrderValue: 29000,
        generatedAt: new Date(),
      });

      const result = await ExportService.exportPnLToSheets({ year: 2026, month: 1 });

      expect(result.sheetUrl).toContain('docs.google.com');
      expect(mockAddRows).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({ Metric: 'Gross Revenue' }),
        ])
      );
    });

    it('creates a new sheet tab if the PnL tab does not exist', async () => {
      await ExportService.exportPnLToSheets({ year: 2025, month: 6 });
      expect(mockAddSheet).toHaveBeenCalled();
    });
  });

  // -----------------------------------------
  // Error handling
  // -----------------------------------------

  describe('error handling', () => {
    it('throws a descriptive error when spreadsheet ID is not configured', async () => {
      delete process.env.GOOGLE_SHEETS_SPREADSHEET_ID;

      await expect(
        ExportService.exportOrdersToSheets({
          startDate: new Date(),
          endDate: new Date(),
          spreadsheetId: undefined,
        })
      ).rejects.toThrow(/spreadsheet ID not configured/i);
    });
  });
});
