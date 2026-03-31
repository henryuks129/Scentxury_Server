/**
 * ============================================
 * SANITIZE MIDDLEWARE - UNIT TESTS
 * ============================================
 *
 * Tests for the custom NoSQL injection sanitization middleware.
 * This middleware replaces express-mongo-sanitize which is
 * incompatible with Express 5.x (req.query is read-only).
 *
 * Test categories:
 *  1. stripDangerousKeys — unit tests for the core sanitization function
 *  2. sanitize middleware — integration tests via express/supertest
 *
 * @file src/middleware/__tests__/sanitize.middleware.unit.test.ts
 */

import { describe, it, expect, vi } from 'vitest';
import request from 'supertest';
import express, { Express } from 'express';
import { sanitize, stripDangerousKeys } from '../sanitize.middleware.js';

// ============================================
// 1. stripDangerousKeys — pure function tests
// ============================================

describe('stripDangerousKeys', () => {
  describe('Primitive passthrough', () => {
    it('should return strings unchanged', () => {
      expect(stripDangerousKeys('hello')).toBe('hello');
    });

    it('should return numbers unchanged', () => {
      expect(stripDangerousKeys(42)).toBe(42);
    });

    it('should return booleans unchanged', () => {
      expect(stripDangerousKeys(true)).toBe(true);
    });

    it('should return null unchanged', () => {
      expect(stripDangerousKeys(null)).toBeNull();
    });

    it('should return undefined unchanged', () => {
      expect(stripDangerousKeys(undefined)).toBeUndefined();
    });
  });

  describe('MongoDB operator key removal', () => {
    it('should strip keys starting with "$"', () => {
      // Classic NoSQL injection: { "$gt": "" }
      const input = { $gt: '', $ne: '', $where: 'function(){}' };
      expect(stripDangerousKeys(input)).toEqual({});
    });

    it('should strip "$" keys from a login payload', () => {
      // Attack: bypass password check with { "password": { "$gt": "" } }
      const input = { email: 'admin@test.com', password: { $gt: '' } };
      expect(stripDangerousKeys(input)).toEqual({
        email: 'admin@test.com',
        password: {}, // $gt stripped; empty object → auth fails safely
      });
    });

    it('should strip nested "$" operator keys', () => {
      const input = { filter: { price: { $gte: 0, $lte: 1000 }, name: 'Rose' } };
      expect(stripDangerousKeys(input)).toEqual({
        filter: { price: {}, name: 'Rose' },
      });
    });

    it('should preserve safe keys alongside stripped ones', () => {
      const input = { name: 'John', $where: '1==1', role: 'user' };
      expect(stripDangerousKeys(input)).toEqual({ name: 'John', role: 'user' });
    });
  });

  describe('Dot-notation key removal', () => {
    it('should strip keys containing "."', () => {
      // Dot-notation injection: { "user.role": "admin" }
      const input = { 'user.role': 'admin', name: 'safe' };
      expect(stripDangerousKeys(input)).toEqual({ name: 'safe' });
    });

    it('should strip deeply dotted keys', () => {
      const input = { 'nested.deep.key': 'value', safe: 'ok' };
      expect(stripDangerousKeys(input)).toEqual({ safe: 'ok' });
    });
  });

  describe('Array handling', () => {
    it('should sanitize elements inside arrays', () => {
      const input = [{ $gt: '' }, { name: 'Rose', $ne: null }];
      expect(stripDangerousKeys(input)).toEqual([{}, { name: 'Rose' }]);
    });

    it('should preserve clean arrays unchanged', () => {
      const input = [1, 'two', { three: 3 }];
      expect(stripDangerousKeys(input)).toEqual([1, 'two', { three: 3 }]);
    });

    it('should handle arrays nested inside objects', () => {
      const input = { items: [{ $where: 'hack' }, { id: 1 }] };
      expect(stripDangerousKeys(input)).toEqual({ items: [{}, { id: 1 }] });
    });
  });

  describe('Deep recursion', () => {
    it('should sanitize deeply nested objects', () => {
      const input = {
        level1: {
          level2: {
            level3: { $inject: 'attack', safe: 'value' },
          },
        },
      };
      expect(stripDangerousKeys(input)).toEqual({
        level1: { level2: { level3: { safe: 'value' } } },
      });
    });

    it('should handle mixed safe/unsafe at every level', () => {
      const input = {
        $top: 'bad',
        good: {
          $nested: 'also bad',
          alsoGood: 'fine',
        },
      };
      expect(stripDangerousKeys(input)).toEqual({
        good: { alsoGood: 'fine' },
      });
    });
  });

  describe('Edge cases', () => {
    it('should handle empty objects', () => {
      expect(stripDangerousKeys({})).toEqual({});
    });

    it('should handle empty arrays', () => {
      expect(stripDangerousKeys([])).toEqual([]);
    });

    it('should handle objects with only dangerous keys', () => {
      expect(stripDangerousKeys({ $where: '1', $gt: 0 })).toEqual({});
    });

    it('should handle completely safe objects untouched', () => {
      const input = { name: 'Scentxury', price: 5000, active: true };
      expect(stripDangerousKeys(input)).toEqual(input);
    });
  });
});

// ============================================
// 2. sanitize middleware — Express integration
// ============================================

describe('sanitize middleware (Express integration)', () => {
  let app: Express;

  // Helper: build a minimal Express app with the sanitize middleware
  function buildApp(handler: (req: express.Request, res: express.Response) => void): Express {
    const a = express();
    a.use(express.json());
    a.use(sanitize);
    a.post('/test', handler);
    a.get('/test/:id', handler);
    return a;
  }

  describe('req.body sanitization', () => {
    it('should strip $-operator keys from request body', async () => {
      let receivedBody: unknown;

      const app = buildApp((req, res) => {
        receivedBody = req.body;
        res.json({ body: req.body });
      });

      await request(app)
        .post('/test')
        .send({ email: 'admin@test.com', password: { $gt: '' } })
        .expect(200);

      // $gt stripped; password becomes {}
      expect((receivedBody as Record<string, unknown>).password).toEqual({});
      expect((receivedBody as Record<string, unknown>).email).toBe('admin@test.com');
    });

    it('should preserve legitimate body fields', async () => {
      let receivedBody: unknown;

      const app = buildApp((req, res) => {
        receivedBody = req.body;
        res.json({ body: req.body });
      });

      const payload = { name: 'Rose Oud', price: 35000, inStock: true };

      await request(app).post('/test').send(payload).expect(200);

      expect(receivedBody).toEqual(payload);
    });

    it('should strip $where JavaScript injection', async () => {
      let receivedBody: unknown;

      const app = buildApp((req, res) => {
        receivedBody = req.body;
        res.json({ ok: true });
      });

      await request(app)
        .post('/test')
        .send({ $where: 'function(){ return true; }', safe: 'value' })
        .expect(200);

      expect(receivedBody).toEqual({ safe: 'value' });
    });

    it('should handle empty body without errors', async () => {
      const app = buildApp((_req, res) => res.json({ ok: true }));

      await request(app).post('/test').send({}).expect(200);
    });

    it('should handle body with nested arrays containing operators', async () => {
      let receivedBody: unknown;

      const app = buildApp((req, res) => {
        receivedBody = req.body;
        res.json({ ok: true });
      });

      await request(app)
        .post('/test')
        .send({ items: [{ $ne: null, name: 'Oud' }, { id: 2 }] })
        .expect(200);

      expect(receivedBody).toEqual({
        items: [{ name: 'Oud' }, { id: 2 }],
      });
    });
  });

  describe('req.params sanitization', () => {
    it('should call next() normally for clean params', async () => {
      const app = buildApp((req, res) => {
        res.json({ id: req.params.id });
      });

      const response = await request(app).get('/test/123abc').expect(200);

      expect(response.body.id).toBe('123abc');
    });
  });

  describe('Middleware chaining', () => {
    it('should call next() and not block the request', async () => {
      const nextSpy = vi.fn();
      const mockReq = { body: { name: 'Test' }, params: {} } as express.Request;
      const mockRes = {} as express.Response;

      sanitize(mockReq, mockRes, nextSpy);

      expect(nextSpy).toHaveBeenCalledOnce();
    });

    it('should not modify req.query', async () => {
      // req.query is read-only in Express 5 — middleware must not touch it
      let capturedQuery: unknown;

      const app2 = express();
      app2.use(express.json());
      app2.use(sanitize);
      app2.get('/search', (req, res) => {
        capturedQuery = req.query;
        res.json({ query: req.query });
      });

      const response = await request(app2)
        .get('/search?name=oud&page=1')
        .expect(200);

      // Query should pass through untouched (validated by Zod in controllers)
      expect(response.body.query).toEqual({ name: 'oud', page: '1' });
    });
  });
});
