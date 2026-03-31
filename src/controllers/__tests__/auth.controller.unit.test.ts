/**
 * ============================================
 * AUTH CONTROLLER UNIT TESTS
 * ============================================
 *
 * Tests controller functions in isolation by mocking AuthService.
 *
 * @file src/controllers/__tests__/auth.controller.unit.test.ts
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as authController from '../auth.controller.js';
import * as AuthService from '../../services/auth.service.js';
import { mockRequest, mockResponse } from '../../test/helpers.js';
import { Types } from 'mongoose';

// ============================================
// MOCKS
// ============================================

vi.mock('../../services/auth.service.js');

const mockUserId = new Types.ObjectId().toString();

function createMockUser(overrides = {}) {
  return {
    id: mockUserId,
    email: 'test@example.com',
    firstName: 'Test',
    lastName: 'User',
    role: 'user',
    isVerified: false,
    isActive: true,
    referralCode: 'CHI-ABC123',
    addresses: [],
    createdAt: new Date(),
    updatedAt: new Date(),
    toObject: vi.fn().mockReturnValue({
      id: mockUserId,
      email: 'test@example.com',
      firstName: 'Test',
      lastName: 'User',
      role: 'user',
      ...overrides,
    }),
    ...overrides,
  };
}

const mockTokens = {
  accessToken: 'access.token.here',
  refreshToken: 'refresh.token.here',
  expiresIn: 900,
};

// ============================================
// REGISTER
// ============================================

describe('authController.register', () => {
  beforeEach(() => vi.clearAllMocks());

  it('should return 201 with user and tokens on success', async () => {
    vi.mocked(AuthService.register).mockResolvedValue({
      user: createMockUser() as ReturnType<typeof createMockUser>,
      tokens: mockTokens,
    });

    const req = mockRequest({
      body: {
        email: 'test@example.com',
        password: 'Password1!',
        firstName: 'Test',
        lastName: 'User',
      },
    });
    const res = mockResponse();
    const next = vi.fn();

    await authController.register(
      req as Parameters<typeof authController.register>[0],
      res as Parameters<typeof authController.register>[1],
      next
    );

    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        message: expect.stringContaining('created'),
        data: expect.objectContaining({ accessToken: mockTokens.accessToken }),
      })
    );
  });

  it('should call next with error when AuthService.register throws', async () => {
    const err = new Error('Conflict');
    vi.mocked(AuthService.register).mockRejectedValue(err);

    const req = mockRequest({ body: {} });
    const res = mockResponse();
    const next = vi.fn();

    await authController.register(
      req as Parameters<typeof authController.register>[0],
      res as Parameters<typeof authController.register>[1],
      next
    );

    expect(next).toHaveBeenCalledWith(err);
  });
});

// ============================================
// LOGIN
// ============================================

describe('authController.login', () => {
  beforeEach(() => vi.clearAllMocks());

  it('should return 200 with user and tokens on success', async () => {
    vi.mocked(AuthService.login).mockResolvedValue({
      user: createMockUser() as ReturnType<typeof createMockUser>,
      tokens: mockTokens,
    });

    const req = mockRequest({ body: { email: 'test@example.com', password: 'Password1!' } });
    const res = mockResponse();
    const next = vi.fn();

    await authController.login(
      req as Parameters<typeof authController.login>[0],
      res as Parameters<typeof authController.login>[1],
      next
    );

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ success: true, message: expect.stringContaining('Login') })
    );
  });

  it('should call next with error on invalid credentials', async () => {
    const err = new Error('Unauthorized');
    vi.mocked(AuthService.login).mockRejectedValue(err);

    const req = mockRequest({ body: { email: 'x@x.com', password: 'wrong' } });
    const res = mockResponse();
    const next = vi.fn();

    await authController.login(
      req as Parameters<typeof authController.login>[0],
      res as Parameters<typeof authController.login>[1],
      next
    );

    expect(next).toHaveBeenCalledWith(err);
  });
});

// ============================================
// LOGOUT
// ============================================

describe('authController.logout', () => {
  beforeEach(() => vi.clearAllMocks());

  it('should return 200 on successful logout', async () => {
    vi.mocked(AuthService.logout).mockResolvedValue();

    const req = mockRequest({ user: { id: mockUserId, role: 'user' }, body: {} });
    const res = mockResponse();
    const next = vi.fn();

    await authController.logout(
      req as Parameters<typeof authController.logout>[0],
      res as Parameters<typeof authController.logout>[1],
      next
    );

    expect(res.status).toHaveBeenCalledWith(200);
    expect(AuthService.logout).toHaveBeenCalledWith(mockUserId, undefined);
  });
});

// ============================================
// GET ME
// ============================================

describe('authController.getMe', () => {
  beforeEach(() => vi.clearAllMocks());

  it('should return 200 with user profile', async () => {
    vi.mocked(AuthService.getMe).mockResolvedValue(
      createMockUser() as ReturnType<typeof createMockUser>
    );

    const req = mockRequest({ user: { id: mockUserId, role: 'user' } });
    const res = mockResponse();
    const next = vi.fn();

    await authController.getMe(
      req as Parameters<typeof authController.getMe>[0],
      res as Parameters<typeof authController.getMe>[1],
      next
    );

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ success: true, data: expect.objectContaining({ user: expect.any(Object) }) })
    );
  });
});

// ============================================
// REFRESH
// ============================================

describe('authController.refresh', () => {
  beforeEach(() => vi.clearAllMocks());

  it('should return 200 with new tokens', async () => {
    vi.mocked(AuthService.refreshTokens).mockResolvedValue(mockTokens);

    const req = mockRequest({ body: { refreshToken: 'old.refresh.token' } });
    const res = mockResponse();
    const next = vi.fn();

    await authController.refresh(
      req as Parameters<typeof authController.refresh>[0],
      res as Parameters<typeof authController.refresh>[1],
      next
    );

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ success: true, data: mockTokens })
    );
  });
});

// ============================================
// FORGOT PASSWORD
// ============================================

describe('authController.forgotPassword', () => {
  beforeEach(() => vi.clearAllMocks());

  it('should always return 200 (prevent enumeration)', async () => {
    vi.mocked(AuthService.forgotPassword).mockResolvedValue('some-token');

    const req = mockRequest({ body: { email: 'anyone@example.com' } });
    const res = mockResponse();
    const next = vi.fn();

    await authController.forgotPassword(
      req as Parameters<typeof authController.forgotPassword>[0],
      res as Parameters<typeof authController.forgotPassword>[1],
      next
    );

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ success: true })
    );
  });
});

// ============================================
// CHANGE PASSWORD
// ============================================

describe('authController.changePassword', () => {
  beforeEach(() => vi.clearAllMocks());

  it('should return 200 on successful password change', async () => {
    vi.mocked(AuthService.changePassword).mockResolvedValue();

    const req = mockRequest({
      user: { id: mockUserId, role: 'user' },
      body: { currentPassword: 'OldPass1!', newPassword: 'NewPass1!' },
    });
    const res = mockResponse();
    const next = vi.fn();

    await authController.changePassword(
      req as Parameters<typeof authController.changePassword>[0],
      res as Parameters<typeof authController.changePassword>[1],
      next
    );

    expect(res.status).toHaveBeenCalledWith(200);
    expect(AuthService.changePassword).toHaveBeenCalledWith(mockUserId, 'OldPass1!', 'NewPass1!');
  });
});
