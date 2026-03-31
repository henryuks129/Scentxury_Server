/**
 * ============================================
 * CHATBOT SERVICE — UNIT TESTS
 * ============================================
 *
 * Tests Angelina chatbot:
 * - Intent classification (keyword matching)
 * - Response generation per intent
 * - Session lifecycle (start, get, append, end) via mocked Redis
 * - Full processMessage pipeline
 *
 * Redis is mocked; MongoDB in-memory for product/order lookups.
 *
 * @file src/services/__tests__/chatbot.service.unit.test.ts
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ChatbotService } from '../chatbot.service.js';
import { Product } from '../../models/Product.js';
import { User } from '../../models/User.js';
import { Order } from '../../models/Order.js';
import mongoose from 'mongoose';

// ============================================
// MOCK REDIS
// ============================================

// We store session data in a simple Map to simulate Redis behaviour
const sessionStore = new Map<string, string>();

vi.mock('../../config/redis.js', () => ({
  redisClient: {
    get: vi.fn((key: string) => Promise.resolve(sessionStore.get(key) ?? null)),
    setex: vi.fn((key: string, _ttl: number, value: string) => {
      sessionStore.set(key, value);
      return Promise.resolve('OK');
    }),
    del: vi.fn((key: string) => {
      sessionStore.delete(key);
      return Promise.resolve(1);
    }),
  },
  connectRedis: vi.fn(),
  disconnectRedis: vi.fn(),
  isRedisConnected: vi.fn().mockReturnValue(false),
  setCache: vi.fn(),
  getCache: vi.fn().mockResolvedValue(null),
  deleteCache: vi.fn(),
}));

// ============================================
// HELPERS
// ============================================

beforeEach(() => {
  sessionStore.clear();
});

const makeProduct = () => ({
  name: `Oud ${Math.random().toString(36).slice(2)}`,
  description: 'A rich test fragrance',
  category: 'unisex' as const,
  brand: 'Chi',
  scentFamily: 'oriental',
  scentNotes: { top: ['oud'], middle: ['amber'], base: ['musk'] },
  images: { boxed: 'http://b.jpg', bottle: 'http://bt.jpg', thumbnail: 'http://th.jpg' },
  variants: [{ sku: `SKU-${Date.now()}-${Math.random()}`, size: '50ml' as const, priceNGN: 45000, priceUSD: 55, costPrice: 20000, stock: 30 }],
  isActive: true,
  basePrice: 45000,
});

// ============================================
// TESTS
// ============================================

describe('ChatbotService', () => {
  // -----------------------------------------
  // 6.2.1 Intent Classification
  // -----------------------------------------

  describe('classifyIntent', () => {
    it('classifies greeting intent from "hello"', () => {
      const result = ChatbotService.classifyIntent('hello there!');
      expect(result.intent).toBe('greeting');
      expect(result.confidence).toBeGreaterThan(0.5);
    });

    it('classifies recommendation_request from "recommend"', () => {
      const result = ChatbotService.classifyIntent('Can you recommend something for me?');
      expect(result.intent).toBe('recommendation_request');
    });

    it('classifies order_status from "track my order"', () => {
      const result = ChatbotService.classifyIntent('I want to track my order');
      expect(result.intent).toBe('order_status');
    });

    it('classifies price_inquiry from "how much does it cost"', () => {
      const result = ChatbotService.classifyIntent('How much does this cost?');
      expect(result.intent).toBe('price_inquiry');
    });

    it('classifies complaint intent from "broken bottle"', () => {
      const result = ChatbotService.classifyIntent('My bottle arrived broken with a problem');
      expect(result.intent).toBe('complaint');
    });

    it('classifies farewell from "thank you, bye"', () => {
      const result = ChatbotService.classifyIntent('Thank you, bye!');
      // "thanks" and "bye" both trigger farewell
      expect(result.intent).toBe('farewell');
    });

    it('falls back to unknown for unrecognised input', () => {
      const result = ChatbotService.classifyIntent('xkcd purple monkey dishwasher 12345');
      expect(result.intent).toBe('unknown');
      expect(result.confidence).toBeLessThan(0.5);
    });
  });

  // -----------------------------------------
  // 6.2.2 Response Generation
  // -----------------------------------------

  describe('generateResponse', () => {
    it('returns a greeting message for greeting intent', async () => {
      const { reply } = await ChatbotService.generateResponse(
        'greeting',
        { userId: undefined, sessionId: 'test-session', messageHistory: [] },
        'hello'
      );
      expect(reply).toBeTruthy();
      expect(typeof reply).toBe('string');
      // Should mention Angelina or Scentxury
      expect(reply.toLowerCase()).toMatch(/angelina|scentxury/i);
    });

    it('returns recommendations for recommendation_request intent', async () => {
      // Seed a product so recommendations can return something
      await Product.create(makeProduct());

      const { reply, products } = await ChatbotService.generateResponse(
        'recommendation_request',
        { userId: undefined, sessionId: 'test-session', messageHistory: [] },
        'recommend something'
      );
      expect(typeof reply).toBe('string');
      // Products array may be populated
      expect(Array.isArray(products)).toBe(true);
    });

    it('returns support message for complaint intent', async () => {
      const { reply } = await ChatbotService.generateResponse(
        'complaint',
        { userId: undefined, sessionId: 'complaint-session', messageHistory: [] },
        'my order arrived damaged'
      );
      expect(reply).toMatch(/sorry|support@scentxury/i);
    });

    it('returns help suggestions for unknown intent', async () => {
      const { reply } = await ChatbotService.generateResponse(
        'unknown',
        { userId: undefined, sessionId: 'test-session', messageHistory: [] },
        'jibberish input'
      );
      expect(reply).toContain('help');
    });
  });

  // -----------------------------------------
  // 6.2.3 Session Lifecycle
  // -----------------------------------------

  describe('session management', () => {
    it('startSession creates a Redis key and returns a sessionId', async () => {
      const sessionId = await ChatbotService.startSession();
      expect(typeof sessionId).toBe('string');
      expect(sessionId.length).toBeGreaterThan(0);
      // Verify session is in the store
      const raw = sessionStore.get(`chat:${sessionId}`);
      expect(raw).toBeDefined();
    });

    it('getSession returns an empty array for a brand-new session', async () => {
      const sessionId = await ChatbotService.startSession();
      const messages = await ChatbotService.getSession(sessionId);
      expect(messages).toEqual([]);
    });

    it('appendMessage adds messages to the session', async () => {
      const sessionId = await ChatbotService.startSession();
      await ChatbotService.appendMessage(sessionId, {
        role: 'user',
        content: 'Hello Angelina',
        timestamp: new Date().toISOString(),
        intent: 'greeting',
      });

      const messages = await ChatbotService.getSession(sessionId);
      expect(messages.length).toBe(1);
      expect(messages[0]!.content).toBe('Hello Angelina');
    });
  });

  // -----------------------------------------
  // 6.2 Full Pipeline
  // -----------------------------------------

  describe('processMessage', () => {
    it('full pipeline returns reply and sessionId', async () => {
      const sessionId = await ChatbotService.startSession();
      await Product.create(makeProduct());

      const result = await ChatbotService.processMessage(sessionId, 'hello');

      expect(result.sessionId).toBe(sessionId);
      expect(typeof result.reply).toBe('string');
      expect(typeof result.intent).toBe('string');
    });

    it('stores both user and bot messages in session after processMessage', async () => {
      const sessionId = await ChatbotService.startSession();

      await ChatbotService.processMessage(sessionId, 'hello');

      const messages = await ChatbotService.getSession(sessionId);
      // Should have 2 messages: user + bot
      expect(messages.length).toBe(2);
      expect(messages[0]!.role).toBe('user');
      expect(messages[1]!.role).toBe('bot');
    });
  });

  // -----------------------------------------
  // endSession
  // -----------------------------------------

  describe('endSession', () => {
    it('removes the session from Redis', async () => {
      const sessionId = await ChatbotService.startSession();

      // Verify session exists
      expect(sessionStore.has(`chat:${sessionId}`)).toBe(true);

      await ChatbotService.endSession(sessionId);

      // Verify session is deleted
      expect(sessionStore.has(`chat:${sessionId}`)).toBe(false);
    });
  });
});
