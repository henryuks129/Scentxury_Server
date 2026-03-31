/**
 * ============================================
 * CHATBOT SERVICE — "Angelina" AI Support Bot
 * ============================================
 *
 * Keyword-based intent classifier + response generator.
 * No external LLM dependency — fully self-contained.
 *
 * Session management via Redis (TTL 3600s).
 * Message history archived to MongoDB on endSession.
 *
 * @file src/services/chatbot.service.ts
 */

import { v4 as uuidv4 } from 'uuid';
import { redisClient } from '@config/redis.js';
import { Product, type IProduct } from '@models/Product.js';
import { Order } from '@models/Order.js';
import { Survey } from '@models/Survey.js';
import { RecommendationService } from '@services/recommendation.service.js';

// ============================================
// TYPES
// ============================================

export type ChatIntent =
  | 'product_inquiry'
  | 'recommendation_request'
  | 'order_status'
  | 'price_inquiry'
  | 'stock_check'
  | 'complaint'
  | 'greeting'
  | 'farewell'
  | 'survey_start'
  | 'unknown';

export interface IChatContext {
  userId?: string;
  sessionId: string;
  messageHistory: IChatMessage[];
}

export interface IChatMessage {
  role: 'user' | 'bot';
  content: string;
  timestamp: string;
  intent?: string;
}

export interface IIntentResult {
  intent: ChatIntent;
  confidence: number;
  entities: string[];
}

export interface IProcessResult {
  reply: string;
  intent: string;
  products?: IProduct[];
  sessionId: string;
}

// Intent → keyword map
const INTENT_KEYWORDS: Record<ChatIntent, string[]> = {
  product_inquiry: ['what', 'tell me', 'describe', 'about', 'info', 'details', 'ingredients'],
  recommendation_request: ['recommend', 'suggest', 'something', 'good for', 'which', 'best', 'give me'],
  order_status: ['order', 'track', 'where', 'status', 'delivery', 'shipped', 'arrive', 'tracking'],
  price_inquiry: ['price', 'cost', 'how much', 'cheap', 'expensive', 'afford'],
  stock_check: ['available', 'in stock', 'sold out', 'stock', 'out of stock', 'do you have'],
  complaint: ['wrong', 'broken', 'damaged', 'bad', 'fake', 'problem', 'issue', 'unhappy', 'refund'],
  greeting: ['hello', 'hi', 'hey', 'good morning', 'good evening', 'good afternoon', 'howdy'],
  farewell: ['bye', 'goodbye', 'thanks', 'thank you', 'done', 'see you', 'later'],
  survey_start: ["help me choose", "don't know", "find me", 'quiz', 'which one', 'not sure'],
  unknown: [],
};

// Greeting messages — randomised for variety
const GREETINGS = [
  "Hi there! I'm Angelina, your personal fragrance advisor at Scentxury. How can I help you find your perfect scent today?",
  "Hello, beautiful! Angelina here 🌸 Welcome to Scentxury. Are you looking for something special today?",
  "Hey! Welcome to Scentxury! I'm Angelina and I'm here to help you discover your signature scent. What can I do for you?",
];

const SESSION_TTL = 3600; // 1 hour

// ============================================
// CHATBOT SERVICE
// ============================================

export class ChatbotService {
  // ----------------------------------------
  // 6.2.1 Intent Classification
  // ----------------------------------------

  /**
   * Keyword-based intent classifier.
   * Returns intent, confidence (0–1), and extracted entity words.
   */
  static classifyIntent(message: string): IIntentResult {
    const lower = message.toLowerCase();

    let bestIntent: ChatIntent = 'unknown';
    let bestScore = 0;
    const entities: string[] = [];

    for (const [intent, keywords] of Object.entries(INTENT_KEYWORDS) as [ChatIntent, string[]][]) {
      if (intent === 'unknown') continue;

      const matchCount = keywords.filter((kw) => lower.includes(kw)).length;
      if (matchCount > bestScore) {
        bestScore = matchCount;
        bestIntent = intent;
        // Collect the matched words as entities
        keywords.forEach((kw) => {
          if (lower.includes(kw)) entities.push(kw);
        });
      }
    }

    // Confidence: 1 keyword = 0.7, 2+ = 0.9
    const confidence = bestScore === 0 ? 0.1 : bestScore === 1 ? 0.7 : 0.9;

    return { intent: bestIntent, confidence, entities };
  }

  // ----------------------------------------
  // 6.2.2 Response Generation
  // ----------------------------------------

  /**
   * Generate a response based on classified intent and session context.
   */
  static async generateResponse(
    intent: ChatIntent,
    context: IChatContext,
    userMessage: string
  ): Promise<{ reply: string; products?: IProduct[] }> {
    const lower = userMessage.toLowerCase();

    switch (intent) {
      case 'greeting': {
        const idx = Math.floor(Math.random() * GREETINGS.length);
        return { reply: GREETINGS[idx] ?? 'Hello! How can I help you?' };
      }

      case 'farewell': {
        return {
          reply:
            "Thank you for visiting Scentxury! Stay beautiful and fragrant 🌸 Don't forget to subscribe to push notifications so you never miss a new arrival or special offer. Bye for now!",
        };
      }

      case 'recommendation_request': {
        const hybridResult = await RecommendationService.getHybridRecommendations({
          userId: context.userId,
          limit: 3,
        });
        if (hybridResult.products.length === 0) {
          return { reply: "I'd love to help! Could you tell me more about the occasion or scent you're looking for?" };
        }
        const names = hybridResult.products.map((p) => p.name).join(', ');
        return {
          reply: `Based on your preferences, I recommend: ${names}. Each of these is a bestseller! Would you like more details on any of them?`,
          products: hybridResult.products,
        };
      }

      case 'order_status': {
        if (!context.userId) {
          return {
            reply:
              "To check your order status, please log in to your account first. Once you're logged in, I can pull up your order details instantly!",
          };
        }
        const latestOrder = await Order.findOne({ userId: context.userId })
          .sort({ createdAt: -1 })
          .lean();
        if (!latestOrder) {
          return { reply: "I couldn't find any orders associated with your account. Have you placed an order with us?" };
        }
        return {
          reply: `Your latest order (#${latestOrder.orderNumber}) is currently **${latestOrder.status}**. Payment status: ${latestOrder.paymentStatus}. Need anything else?`,
        };
      }

      case 'product_inquiry': {
        // Extract potential product name from message
        const product = await Product.findOne({
          $text: { $search: userMessage },
          isActive: true,
        }).lean<IProduct>();

        if (!product) {
          return {
            reply:
              "I couldn't find that specific fragrance. Could you double-check the name? You can also browse all our products on our website.",
          };
        }
        return {
          reply: `**${product.name}** — ${product.shortDescription ?? product.description.substring(0, 150)}... Scent family: ${product.scentFamily}. Available in ${product.variants?.map((v) => v.size).join(', ')}. Want to know the price or availability?`,
          products: [product],
        };
      }

      case 'price_inquiry': {
        // Scan for known product or give general range
        const cheapest = await Product.findOne({ isActive: true })
          .sort({ basePrice: 1 })
          .lean<IProduct>();
        const priciest = await Product.findOne({ isActive: true })
          .sort({ basePrice: -1 })
          .lean<IProduct>();

        if (!cheapest || !priciest) {
          return { reply: 'Our fragrances are competitively priced. Visit the shop to see current prices.' };
        }
        return {
          reply: `Our prices range from ₦${cheapest.basePrice?.toLocaleString()} to ₦${priciest.basePrice?.toLocaleString()}. We have options for every budget! Which size are you interested in?`,
        };
      }

      case 'stock_check': {
        // Check if a product keyword appears in message
        const product = await Product.findOne({
          $text: { $search: lower },
          isActive: true,
        }).lean<IProduct>();

        if (!product) {
          return { reply: "Could you tell me which specific fragrance you're asking about? I'll check stock for you right away." };
        }

        const inStock = product.variants?.some((v) => v.isAvailable && v.stock > 0);
        return {
          reply: inStock
            ? `Great news! **${product.name}** is currently in stock. Available sizes: ${product.variants?.filter((v) => v.stock > 0).map((v) => v.size).join(', ')}. Ready to order?`
            : `Unfortunately, **${product.name}** is currently out of stock. I can notify you as soon as it's back — shall I add you to the waitlist?`,
          products: [product],
        };
      }

      case 'complaint': {
        // Store as Survey complaint record
        await Survey.create({
          sessionId: context.sessionId,
          userId: context.userId ?? undefined,
          status: 'completed',
          source: 'chatbot',
          totalSteps: 1,
          currentStep: 1,
          responses: [
            {
              questionId: 'complaint',
              questionText: 'User complaint',
              answer: userMessage,
              weight: 10,
            },
          ],
        });

        return {
          reply:
            "I'm really sorry to hear that! 😔 I've logged your complaint and our team will reach out within 2 hours. For urgent issues, please email us at support@scentxury.com. Your satisfaction is our top priority!",
        };
      }

      case 'survey_start': {
        return {
          reply:
            "Let's find your perfect scent! I have a quick 5-question quiz that will help me recommend the ideal fragrance for you. Ready? Let's start: **What occasion will you mainly wear this fragrance for?** (Options: Evening, Office, Casual, Special events)",
        };
      }

      case 'unknown':
      default: {
        return {
          reply:
            "I'm not quite sure I understand, but I'm here to help! You can ask me about:\n• Product recommendations\n• Order status\n• Prices & availability\n• Fragrance quiz\n\nOr email support@scentxury.com for complex queries.",
        };
      }
    }
  }

  // ----------------------------------------
  // 6.2.3 Session Management
  // ----------------------------------------

  /**
   * Create a new Redis chat session. Returns sessionId.
   * Session TTL: 3600s (1 hour).
   */
  static async startSession(userId?: string): Promise<string> {
    const sessionId = uuidv4();
    const sessionData = {
      userId: userId ?? null,
      messages: [] as IChatMessage[],
      createdAt: new Date().toISOString(),
    };
    await redisClient.setex(
      `chat:${sessionId}`,
      SESSION_TTL,
      JSON.stringify(sessionData)
    );
    return sessionId;
  }

  /**
   * Retrieve message history for a session.
   * Returns empty array if session not found.
   */
  static async getSession(sessionId: string): Promise<IChatMessage[]> {
    const raw = await redisClient.get(`chat:${sessionId}`);
    if (!raw) return [];
    const data = JSON.parse(raw);
    return data.messages ?? [];
  }

  /**
   * Append a message to the session and refresh TTL.
   */
  static async appendMessage(
    sessionId: string,
    message: IChatMessage
  ): Promise<void> {
    const raw = await redisClient.get(`chat:${sessionId}`);
    if (!raw) return;
    const data = JSON.parse(raw);
    data.messages.push(message);
    await redisClient.setex(`chat:${sessionId}`, SESSION_TTL, JSON.stringify(data));
  }

  /**
   * End a session — delete from Redis.
   * If userId present, the complaint logs are already stored in Survey.
   */
  static async endSession(sessionId: string): Promise<void> {
    await redisClient.del(`chat:${sessionId}`);
  }

  /**
   * Full pipeline: classify intent → generate response → save messages.
   * Creates a new session automatically if sessionId is not found.
   */
  static async processMessage(
    sessionId: string,
    userMessage: string,
    userId?: string
  ): Promise<IProcessResult> {
    // Get or create session
    let messages = await ChatbotService.getSession(sessionId);
    if (messages.length === 0) {
      // Session may have expired — restart
      await ChatbotService.startSession(userId);
      messages = [];
    }

    const context: IChatContext = { userId, sessionId, messageHistory: messages };

    // Classify intent
    const { intent, confidence } = ChatbotService.classifyIntent(userMessage);
    void confidence; // used for future analytics

    // Generate response
    const { reply, products } = await ChatbotService.generateResponse(
      intent,
      context,
      userMessage
    );

    // Persist user message
    const userMsg: IChatMessage = {
      role: 'user',
      content: userMessage,
      timestamp: new Date().toISOString(),
      intent,
    };
    await ChatbotService.appendMessage(sessionId, userMsg);

    // Persist bot reply
    const botMsg: IChatMessage = {
      role: 'bot',
      content: reply,
      timestamp: new Date().toISOString(),
      intent,
    };
    await ChatbotService.appendMessage(sessionId, botMsg);

    return { reply, intent, products, sessionId };
  }
}
