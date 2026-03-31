/**
 * ============================================
 * CHATBOT CONTROLLER — UNIT TESTS
 * ============================================
 *
 * Tests Angelina chatbot HTTP handlers:
 * - startChat — returns sessionId + greeting, works for guest
 * - sendMessage — returns reply, intent, and products for recs
 * - endChat — deletes Redis session
 *
 * ChatbotService is mocked for all tests.
 *
 * @file src/controllers/__tests__/chatbot.controller.unit.test.ts
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  startChat,
  sendMessage,
  endChat,
} from '../chatbot.controller.js';
import { mockRequest, mockResponse, mockNext } from '../../test/helpers.js';
import { BadRequestError } from '../../utils/errors.js';

// ============================================
// MOCK CHATBOT SERVICE
// ============================================

// vi.mock is hoisted to the top of the file, so variables referenced inside
// its factory must also be hoisted using vi.hoisted().
const { mockStartSession, mockProcessMessage, mockEndSession, mockGenerateResponse } = vi.hoisted(() => ({
  mockStartSession: vi.fn(),
  mockProcessMessage: vi.fn(),
  mockEndSession: vi.fn(),
  mockGenerateResponse: vi.fn(),
}));

vi.mock('../../services/chatbot.service.js', () => ({
  ChatbotService: {
    startSession: mockStartSession,
    processMessage: mockProcessMessage,
    endSession: mockEndSession,
    generateResponse: mockGenerateResponse,
  },
}));

// ============================================
// TESTS
// ============================================

beforeEach(() => {
  // Restore implementations — vi.resetAllMocks() in setup.ts afterEach wipes them.
  mockStartSession.mockResolvedValue('test-session-id-abc123');
  mockGenerateResponse.mockResolvedValue({
    reply: "Hi! I'm Angelina, welcome to Scentxury!",
    products: [],
  });
  mockProcessMessage.mockResolvedValue({
    reply: 'I recommend this fragrance for you.',
    intent: 'recommendation_request',
    products: [{ _id: 'prod-1', name: 'Oud Royal' }],
    sessionId: 'test-session-id-abc123',
  });
  mockEndSession.mockResolvedValue(undefined);
});

describe('ChatbotController', () => {
  // -----------------------------------------
  // startChat
  // -----------------------------------------

  describe('startChat', () => {
    it('returns 201 with sessionId and greeting message', async () => {
      const req = mockRequest({ user: { id: 'user-1', role: 'user' } });
      const res = mockResponse();
      const next = mockNext();

      await startChat(req as never, res as never, next);

      expect(res._getStatusCode()).toBe(201);
      const data = res._getData() as { success: boolean; data: { sessionId: string; greeting: string } };
      expect(data.success).toBe(true);
      expect(data.data.sessionId).toBe('test-session-id-abc123');
      expect(typeof data.data.greeting).toBe('string');
      expect(data.data.greeting.length).toBeGreaterThan(0);
    });

    it('works for unauthenticated guest (no user in request)', async () => {
      const req = mockRequest(); // no user
      const res = mockResponse();
      const next = mockNext();

      await startChat(req as never, res as never, next);

      expect(res._getStatusCode()).toBe(201);
      // Session created with undefined userId
      expect(mockStartSession).toHaveBeenCalledWith(undefined);
    });
  });

  // -----------------------------------------
  // sendMessage
  // -----------------------------------------

  describe('sendMessage', () => {
    it('returns 200 with reply, intent, and products for a recommendation request', async () => {
      const req = mockRequest({
        body: {
          sessionId: 'test-session-id-abc123',
          message: 'Can you recommend something for me?',
        },
        user: { id: 'user-2', role: 'user' },
      });
      const res = mockResponse();
      const next = mockNext();

      await sendMessage(req as never, res as never, next);

      expect(res._getStatusCode()).toBe(200);
      const data = res._getData() as {
        success: boolean;
        data: { reply: string; intent: string; products: unknown[]; sessionId: string };
      };
      expect(data.success).toBe(true);
      expect(data.data.intent).toBe('recommendation_request');
      expect(data.data.products.length).toBeGreaterThan(0);
      expect(data.data.sessionId).toBe('test-session-id-abc123');
    });

    it('calls next(BadRequestError) when sessionId is missing', async () => {
      const req = mockRequest({ body: { message: 'hello' } }); // no sessionId
      const res = mockResponse();
      const next = vi.fn();

      await sendMessage(req as never, res as never, next);

      expect(next).toHaveBeenCalledWith(expect.any(BadRequestError));
    });

    it('calls next(BadRequestError) when message is empty', async () => {
      const req = mockRequest({ body: { sessionId: 'sid-1', message: '   ' } }); // blank message
      const res = mockResponse();
      const next = vi.fn();

      await sendMessage(req as never, res as never, next);

      expect(next).toHaveBeenCalledWith(expect.any(BadRequestError));
    });
  });

  // -----------------------------------------
  // endChat
  // -----------------------------------------

  describe('endChat', () => {
    it('returns 200 and calls ChatbotService.endSession with the correct sessionId', async () => {
      const req = mockRequest({ params: { sessionId: 'test-session-to-end' } });
      const res = mockResponse();
      const next = mockNext();

      await endChat(req as never, res as never, next);

      expect(res._getStatusCode()).toBe(200);
      const data = res._getData() as { success: boolean; message: string };
      expect(data.success).toBe(true);
      expect(mockEndSession).toHaveBeenCalledWith('test-session-to-end');
    });
  });
});
