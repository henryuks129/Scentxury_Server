/**
 * ============================================
 * AUTH MIDDLEWARE UNIT TESTS
 * ============================================
 *
 * @file src/middleware/__tests__/auth.middleware.unit.test.ts
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { authenticate, adminOnly, optionalAuth } from '../auth.middleware.js';
import { mockRequest, mockResponse } from '../../test/helpers.js';

// ============================================
// MOCKS
// ============================================

vi.mock('../../models/User.js', () => ({
  User: {
    findById: vi.fn(),
  },
}));

vi.mock('../../utils/jwt.js', () => ({
  verifyAccessToken: vi.fn(),
  extractBearerToken: vi.fn(),
}));

import { User } from '../../models/User.js';
import { verifyAccessToken, extractBearerToken } from '../../utils/jwt.js';

// ============================================
// AUTHENTICATE
// ============================================

describe('authenticate middleware', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should authenticate with a valid Bearer token', async () => {
    vi.mocked(extractBearerToken).mockReturnValue('valid-token');
    vi.mocked(verifyAccessToken).mockReturnValue({ userId: 'user123', role: 'user' } as ReturnType<typeof verifyAccessToken>);
    vi.mocked(User.findById).mockReturnValue({
      select: vi.fn().mockReturnValue({
        lean: vi.fn().mockResolvedValue({ _id: 'user123', role: 'user', isActive: true }),
      }),
    } as ReturnType<typeof User.findById>);

    const req = mockRequest({ headers: { authorization: 'Bearer valid-token' } });
    const res = mockResponse();
    const next = vi.fn();

    await authenticate(req as Parameters<typeof authenticate>[0], res as Parameters<typeof authenticate>[1], next);

    expect(next).toHaveBeenCalledWith();
    expect(req.user).toEqual({ id: 'user123', role: 'user' });
  });

  it('should call next with 401 when no token provided', async () => {
    vi.mocked(extractBearerToken).mockReturnValue(null);

    const req = mockRequest({ headers: {} });
    const res = mockResponse();
    const next = vi.fn();

    await authenticate(req as Parameters<typeof authenticate>[0], res as Parameters<typeof authenticate>[1], next);

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 401, message: expect.stringContaining('No token') })
    );
    expect(req.user).toBeFalsy();
  });

  it('should call next with 401 when token is invalid', async () => {
    vi.mocked(extractBearerToken).mockReturnValue('bad-token');
    vi.mocked(verifyAccessToken).mockImplementation(() => {
      throw new Error('JsonWebTokenError');
    });

    const req = mockRequest({ headers: { authorization: 'Bearer bad-token' } });
    const res = mockResponse();
    const next = vi.fn();

    await authenticate(req as Parameters<typeof authenticate>[0], res as Parameters<typeof authenticate>[1], next);

    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 401 }));
  });

  it('should call next with 401 when user not found in DB', async () => {
    vi.mocked(extractBearerToken).mockReturnValue('token');
    vi.mocked(verifyAccessToken).mockReturnValue({ userId: 'deleted', role: 'user' } as ReturnType<typeof verifyAccessToken>);
    vi.mocked(User.findById).mockReturnValue({
      select: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue(null) }),
    } as ReturnType<typeof User.findById>);

    const req = mockRequest({ headers: { authorization: 'Bearer token' } });
    const res = mockResponse();
    const next = vi.fn();

    await authenticate(req as Parameters<typeof authenticate>[0], res as Parameters<typeof authenticate>[1], next);

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 401, message: expect.stringContaining('User not found') })
    );
  });

  it('should call next with 401 when user is deactivated', async () => {
    vi.mocked(extractBearerToken).mockReturnValue('token');
    vi.mocked(verifyAccessToken).mockReturnValue({ userId: 'user123', role: 'user' } as ReturnType<typeof verifyAccessToken>);
    vi.mocked(User.findById).mockReturnValue({
      select: vi.fn().mockReturnValue({
        lean: vi.fn().mockResolvedValue({ _id: 'user123', role: 'user', isActive: false }),
      }),
    } as ReturnType<typeof User.findById>);

    const req = mockRequest({ headers: { authorization: 'Bearer token' } });
    const res = mockResponse();
    const next = vi.fn();

    await authenticate(req as Parameters<typeof authenticate>[0], res as Parameters<typeof authenticate>[1], next);

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 401, message: expect.stringContaining('deactivated') })
    );
  });
});

// ============================================
// ADMIN ONLY
// ============================================

describe('adminOnly middleware', () => {
  it('should call next() for admin users', () => {
    const req = mockRequest({ user: { id: 'admin1', role: 'admin' } });
    const res = mockResponse();
    const next = vi.fn();

    adminOnly(req as Parameters<typeof adminOnly>[0], res as Parameters<typeof adminOnly>[1], next);

    expect(next).toHaveBeenCalledWith();
  });

  it('should call next with 403 for non-admin users', () => {
    const req = mockRequest({ user: { id: 'user1', role: 'user' } });
    const res = mockResponse();
    const next = vi.fn();

    adminOnly(req as Parameters<typeof adminOnly>[0], res as Parameters<typeof adminOnly>[1], next);

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 403, message: expect.stringContaining('Admin') })
    );
  });

  it('should call next with 403 when no user on request', () => {
    const req = mockRequest({});
    const res = mockResponse();
    const next = vi.fn();

    adminOnly(req as Parameters<typeof adminOnly>[0], res as Parameters<typeof adminOnly>[1], next);

    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 403 }));
  });
});

// ============================================
// OPTIONAL AUTH
// ============================================

describe('optionalAuth middleware', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should attach user when valid token provided', async () => {
    vi.mocked(extractBearerToken).mockReturnValue('valid-token');
    vi.mocked(verifyAccessToken).mockReturnValue({ userId: 'user123', role: 'user' } as ReturnType<typeof verifyAccessToken>);
    vi.mocked(User.findById).mockReturnValue({
      select: vi.fn().mockReturnValue({
        lean: vi.fn().mockResolvedValue({ _id: 'user123', role: 'user', isActive: true }),
      }),
    } as ReturnType<typeof User.findById>);

    const req = mockRequest({ headers: { authorization: 'Bearer valid-token' } });
    const res = mockResponse();
    const next = vi.fn();

    await optionalAuth(req as Parameters<typeof optionalAuth>[0], res as Parameters<typeof optionalAuth>[1], next);

    expect(req.user).toBeDefined();
    expect(next).toHaveBeenCalledWith();
  });

  it('should continue without user when no token', async () => {
    vi.mocked(extractBearerToken).mockReturnValue(null);

    const req = mockRequest({ headers: {} });
    const res = mockResponse();
    const next = vi.fn();

    await optionalAuth(req as Parameters<typeof optionalAuth>[0], res as Parameters<typeof optionalAuth>[1], next);

    expect(req.user).toBeFalsy();
    expect(next).toHaveBeenCalledWith();
  });

  it('should continue without user when token is invalid', async () => {
    vi.mocked(extractBearerToken).mockReturnValue('bad');
    vi.mocked(verifyAccessToken).mockImplementation(() => {
      throw new Error('Invalid');
    });

    const req = mockRequest({ headers: { authorization: 'Bearer bad' } });
    const res = mockResponse();
    const next = vi.fn();

    await optionalAuth(req as Parameters<typeof optionalAuth>[0], res as Parameters<typeof optionalAuth>[1], next);

    expect(req.user).toBeFalsy();
    expect(next).toHaveBeenCalledWith();
  });
});
