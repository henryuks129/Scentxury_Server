/**
 * ============================================
 * CHATBOT ROUTES — Angelina
 * ============================================
 *
 * /api/v1/chat/*
 *
 * POST   /start         — start session (public)
 * POST   /message       — send message (public / optional auth) — rate limited
 * DELETE /:sessionId    — end session (public)
 *
 * @file src/routes/chatbot.routes.ts
 */

import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { optionalAuth } from '@middleware/auth.middleware.js';
import {
  startChat,
  sendMessage,
  endChat,
} from '@controllers/chatbot.controller.js';

const router = Router();

// Strict rate limit on message endpoint — 30 messages per minute per IP
const chatRateLimit = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 30,
  message: {
    success: false,
    message: 'Too many messages. Please slow down and try again in a minute.',
  },
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => process.env.NODE_ENV === 'test', // disable in tests
});

// Start session — always public (works for guests and authenticated users)
router.post('/start', optionalAuth, startChat);

// Send message — rate limited; optionally authenticated for richer responses
router.post('/message', chatRateLimit, optionalAuth, sendMessage);

// End session — cleans up Redis key
router.delete('/:sessionId', endChat);

export default router;
