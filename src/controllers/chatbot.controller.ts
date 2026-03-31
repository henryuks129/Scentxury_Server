/**
 * ============================================
 * CHATBOT CONTROLLER — "Angelina"
 * ============================================
 *
 * HTTP handlers for the Angelina AI chatbot.
 *
 * Routes:
 *   POST   /api/v1/chat/start        — start a session (public)
 *   POST   /api/v1/chat/message      — send a message (public / optional auth)
 *   DELETE /api/v1/chat/:sessionId   — end session (public)
 *
 * @file src/controllers/chatbot.controller.ts
 */

import { Request, Response, NextFunction } from 'express';
import { ChatbotService } from '@services/chatbot.service.js';
import { BadRequestError } from '@utils/errors.js';

// ============================================
// START CHAT SESSION
// ============================================

/**
 * POST /api/v1/chat/start
 * Creates a new Redis chat session.
 * Works for both authenticated users and guests.
 */
export async function startChat(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const userId = req.user?.id; // optional

    const sessionId = await ChatbotService.startSession(userId);

    // Generate a greeting message as the opening message
    const { reply } = await ChatbotService.generateResponse(
      'greeting',
      { userId, sessionId, messageHistory: [] },
      'hello'
    );

    res.status(201).json({
      success: true,
      data: { sessionId, greeting: reply },
    });
  } catch (err) {
    next(err);
  }
}

// ============================================
// SEND MESSAGE
// ============================================

/**
 * POST /api/v1/chat/message
 * Process an incoming user message and return Angelina's reply.
 * Body: { sessionId: string; message: string }
 */
export async function sendMessage(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { sessionId, message } = req.body as { sessionId?: string; message?: string };

    if (!sessionId || typeof sessionId !== 'string') {
      return next(new BadRequestError('sessionId is required'));
    }
    if (!message || typeof message !== 'string' || message.trim().length === 0) {
      return next(new BadRequestError('message is required and must be a non-empty string'));
    }

    const userId = req.user?.id;

    const result = await ChatbotService.processMessage(
      sessionId,
      message.trim(),
      userId
    );

    res.status(200).json({
      success: true,
      data: {
        reply: result.reply,
        intent: result.intent,
        products: result.products ?? [],
        sessionId: result.sessionId,
      },
    });
  } catch (err) {
    next(err);
  }
}

// ============================================
// END CHAT SESSION
// ============================================

/**
 * DELETE /api/v1/chat/:sessionId
 * Ends the chat session and removes from Redis.
 */
export async function endChat(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const sessionId = String(req.params['sessionId'] ?? '');

    if (!sessionId) {
      return next(new BadRequestError('sessionId is required'));
    }

    await ChatbotService.endSession(sessionId);

    res.status(200).json({
      success: true,
      message: 'Chat session ended successfully',
    });
  } catch (err) {
    next(err);
  }
}
