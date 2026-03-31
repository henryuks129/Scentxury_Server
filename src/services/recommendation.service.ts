/**
 * ============================================
 * RECOMMENDATION SERVICE — AI/ML Engine
 * ============================================
 *
 * Hybrid recommendation engine combining:
 *  - Content-based filtering (scent profile similarity)
 *  - User-based filtering (stored preferences)
 *  - Collaborative filtering (similar-user purchase history)
 *
 * Also handles:
 *  - Combo mix (fragrance layering) suggestions
 *  - Survey-to-preference conversion
 *  - User segmentation & churn detection
 *
 * @file src/services/recommendation.service.ts
 */

import mongoose from 'mongoose';
import { Product, IProduct } from '@models/Product.js';
import { User } from '@models/User.js';
import { Order } from '@models/Order.js';
import { Survey } from '@models/Survey.js';
import { redisClient } from '@config/redis.js';

// ============================================
// TYPES
// ============================================

export interface ISurveyAnswers {
  occasion?: 'daily' | 'evening' | 'office' | 'casual' | 'special';
  intensity?: 'light' | 'moderate' | 'strong' | 'beast-mode';
  gender?: 'male' | 'female' | 'unisex';
  preferredNotes?: string[];
  avoidNotes?: string[];
  budget?: 'affordable' | 'mid-range' | 'premium' | 'luxury';
  season?: 'spring' | 'summer' | 'autumn' | 'winter' | 'all';
}

export interface IScentProfile {
  preferredNotes: string[];
  avoidNotes: string[];
  scentFamilies: string[];
  intensity?: string;
  category?: string;
  budgetNGN?: { min: number; max: number };
}

export interface IComboSuggestion {
  product: IProduct;
  explanation: string;
}

export interface IHybridOptions {
  userId?: string;
  currentProductId?: string;
  limit: number;
}

export interface ISegmentSummary {
  vip: number;
  loyal: number;
  at_risk: number;
  churned: number;
  new: number;
}

export interface IChurnRiskUser {
  userId: string;
  email: string;
  firstName: string;
  daysSinceLastOrder: number;
  totalSpent: number;
  segment: string;
}

// Complementary scent family pairings used by getComboMixRecommendations
const COMPLEMENTARY_FAMILIES: Record<string, string[]> = {
  woody: ['floral', 'oriental'],
  fresh: ['aquatic', 'aromatic'],
  citrus: ['aquatic', 'aromatic'],
  oriental: ['woody', 'spicy'],
  floral: ['fruity', 'powdery'],
  spicy: ['oriental', 'woody'],
  aquatic: ['fresh', 'citrus'],
  fruity: ['floral', 'gourmand'],
  powdery: ['floral', 'musk'],
  gourmand: ['fruity', 'oriental'],
};

// ============================================
// RECOMMENDATION SERVICE
// ============================================

export class RecommendationService {
  // ----------------------------------------
  // 6.1.1 Content-Based Recommendations
  // ----------------------------------------

  /**
   * Recommend products with similar scent profiles to a given product.
   * Scoring: +3 for same scentFamily, +1 per shared note (top/middle/base).
   */
  static async getContentBasedRecommendations(
    productId: string,
    limit: number = 10
  ): Promise<IProduct[]> {
    // Fetch source product
    const source = await Product.findById(productId).lean<IProduct>();
    if (!source) return [];

    const allNotes = [
      ...(source.scentNotes?.top ?? []),
      ...(source.scentNotes?.middle ?? []),
      ...(source.scentNotes?.base ?? []),
    ];

    // Fetch candidate products (same family or any shared note, excluding source)
    const candidates = await Product.find({
      _id: { $ne: source._id },
      isActive: true,
      $or: [
        { scentFamily: source.scentFamily },
        { 'scentNotes.top': { $in: allNotes } },
        { 'scentNotes.middle': { $in: allNotes } },
        { 'scentNotes.base': { $in: allNotes } },
      ],
    })
      .select('name scentFamily scentNotes category variants images')
      .lean<IProduct[]>();

    // Score each candidate
    const scored = candidates.map((p) => {
      let score = 0;
      if (p.scentFamily === source.scentFamily) score += 3;
      const pNotes = [
        ...(p.scentNotes?.top ?? []),
        ...(p.scentNotes?.middle ?? []),
        ...(p.scentNotes?.base ?? []),
      ];
      score += pNotes.filter((n) => allNotes.includes(n)).length;
      return { product: p, score };
    });

    // Sort by score descending, return top `limit`
    return scored
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map((s) => s.product);
  }

  // ----------------------------------------
  // 6.1.2 User-Based Recommendations
  // ----------------------------------------

  /**
   * Recommend products matching a user's stored scent preferences.
   * Excludes products the user has already purchased.
   */
  static async getUserBasedRecommendations(
    userId: string,
    limit: number = 10
  ): Promise<IProduct[]> {
    const user = await User.findById(userId).lean();
    if (!user || !user.scentPreferences) {
      // Fallback to top-rated products if no preferences stored
      return Product.find({ isActive: true })
        .sort({ 'stats.purchaseCount': -1 })
        .limit(limit)
        .lean<IProduct[]>();
    }

    const prefs = user.scentPreferences;

    // Fetch product IDs the user has already ordered
    const orders = await Order.find({
      userId,
      paymentStatus: 'paid',
    })
      .select('items.productId')
      .lean();

    // Derive purchased product IDs safely (item.productId is an ObjectId from lean)
    const purchasedObjectIds = orders.flatMap((o) =>
      o.items.map((i) => i.productId as mongoose.Types.ObjectId)
    );

    // Build query — only add $nin when there are actually purchased products
    // (an empty $nin array can interfere with $or evaluation in some Mongoose versions)
    const query: Record<string, unknown> = { isActive: true };

    if (purchasedObjectIds.length > 0) {
      query._id = { $nin: purchasedObjectIds };
    }

    if (prefs.preferredNotes?.length) {
      query.$or = [
        { 'scentNotes.top': { $in: prefs.preferredNotes } },
        { 'scentNotes.middle': { $in: prefs.preferredNotes } },
        { 'scentNotes.base': { $in: prefs.preferredNotes } },
      ];
    }

    if (prefs.avoidNotes?.length) {
      // Use $nor to exclude products that contain any avoided note in any note field
      query.$nor = [
        { 'scentNotes.top': { $in: prefs.avoidNotes } },
        { 'scentNotes.middle': { $in: prefs.avoidNotes } },
        { 'scentNotes.base': { $in: prefs.avoidNotes } },
      ];
    }

    return Product.find(query)
      .sort({ 'stats.purchaseCount': -1, basePrice: 1 })
      .limit(limit)
      .lean<IProduct[]>();
  }

  // ----------------------------------------
  // 6.1.3 Collaborative Filtering
  // ----------------------------------------

  /**
   * Recommend products bought by users with similar purchase histories.
   * Ranks by purchase frequency among similar users.
   */
  static async getCollaborativeRecommendations(
    userId: string,
    limit: number = 10
  ): Promise<IProduct[]> {
    // Current user's purchased product IDs
    const myOrders = await Order.find({
      userId,
      paymentStatus: 'paid',
    })
      .select('items.productId')
      .lean();

    const myProductIds = myOrders.flatMap((o) =>
      o.items.map((i) => String(i.productId))
    );

    if (myProductIds.length === 0) return [];

    // Find other users who bought ≥2 of the same products
    const similarOrders = await Order.find({
      userId: { $ne: new mongoose.Types.ObjectId(userId) },
      paymentStatus: 'paid',
      'items.productId': {
        $in: myProductIds.map((id) => new mongoose.Types.ObjectId(id)),
      },
    })
      .select('userId items.productId')
      .lean();

    // Count how many of my products each similar user bought
    const userMatchCount: Record<string, number> = {};
    similarOrders.forEach((o) => {
      const uid = String(o.userId);
      const overlap = o.items.filter((i) =>
        myProductIds.includes(String(i.productId))
      ).length;
      userMatchCount[uid] = (userMatchCount[uid] ?? 0) + overlap;
    });

    // Keep only users with ≥2 overlap
    const similarUserIds = Object.entries(userMatchCount)
      .filter(([, count]) => count >= 2)
      .map(([uid]) => uid);

    if (similarUserIds.length === 0) return [];

    // Collect products those users bought that I haven't
    const theirOrders = await Order.find({
      userId: { $in: similarUserIds.map((id) => new mongoose.Types.ObjectId(id)) },
      paymentStatus: 'paid',
    })
      .select('items.productId')
      .lean();

    // Rank by frequency
    const freq: Record<string, number> = {};
    theirOrders.forEach((o) => {
      o.items.forEach((i) => {
        const pid = String(i.productId);
        if (!myProductIds.includes(pid)) {
          freq[pid] = (freq[pid] ?? 0) + 1;
        }
      });
    });

    const topProductIds = Object.entries(freq)
      .sort(([, a], [, b]) => b - a)
      .slice(0, limit)
      .map(([pid]) => new mongoose.Types.ObjectId(pid));

    return Product.find({
      _id: { $in: topProductIds },
      isActive: true,
    })
      .lean<IProduct[]>();
  }

  // ----------------------------------------
  // 6.1.4 Combo Mix Recommendations
  // ----------------------------------------

  /**
   * Suggest fragrance layering pairs for a given product.
   * Uses explicit `layersWith` references first; falls back to scent family logic.
   */
  static async getComboMixRecommendations(
    productId: string
  ): Promise<IComboSuggestion[]> {
    const source = await Product.findById(productId)
      .populate<{ layersWith: IProduct[] }>('layersWith')
      .lean<IProduct & { layersWith: IProduct[] }>();

    if (!source) return [];

    // Use explicit pairings when available
    const layeredWith = (source.layersWith ?? []) as IProduct[];
    if (layeredWith.length > 0) {
      return layeredWith.slice(0, 3).map((p) => ({
        product: p,
        explanation: `${source.name} layers beautifully with ${p.name} for a richer scent experience.`,
      }));
    }

    // Fallback: complementary scent family logic
    const complementary = COMPLEMENTARY_FAMILIES[source.scentFamily] ?? [];
    if (complementary.length === 0) return [];

    const suggestions = await Product.find({
      _id: { $ne: source._id },
      isActive: true,
      scentFamily: { $in: complementary },
    })
      .limit(3)
      .lean<IProduct[]>();

    return suggestions.map((p) => ({
      product: p,
      explanation: `${source.scentFamily} fragrances pair well with ${p.scentFamily} notes. Try layering ${source.name} with ${p.name}.`,
    }));
  }

  // ----------------------------------------
  // 6.1.5 Hybrid Recommendations (Main Entry Point)
  // ----------------------------------------

  /**
   * Merge content-based, user-based, and collaborative strategies
   * with configurable weights. Results are Redis-cached for 30 min.
   */
  static async getHybridRecommendations(options: IHybridOptions): Promise<{
    products: IProduct[];
    source: string[];
  }> {
    const { userId, currentProductId, limit } = options;

    // Build cache key
    const cacheKey = `rec:hybrid:${userId ?? 'guest'}:${currentProductId ?? 'none'}`;

    // Check Redis cache
    try {
      const cached = await redisClient.get(cacheKey);
      if (cached) {
        return JSON.parse(cached);
      }
    } catch {
      // Redis unavailable — continue without cache
    }

    const sources: string[] = [];
    const scored: Map<string, { product: IProduct; score: number }> = new Map();

    // Weight: content-based 0.4, user-based 0.4, collaborative 0.2
    if (currentProductId) {
      const contentBased = await RecommendationService.getContentBasedRecommendations(
        currentProductId,
        limit
      );
      contentBased.forEach((p, idx) => {
        const id = String(p._id);
        const weightedScore = (1 - idx / contentBased.length) * 0.4;
        const existing = scored.get(id);
        scored.set(id, {
          product: p,
          score: (existing?.score ?? 0) + weightedScore,
        });
      });
      if (contentBased.length > 0) sources.push('content-based');
    }

    if (userId) {
      const userBased = await RecommendationService.getUserBasedRecommendations(
        userId,
        limit
      );
      userBased.forEach((p, idx) => {
        const id = String(p._id);
        const weightedScore = (1 - idx / userBased.length) * 0.4;
        const existing = scored.get(id);
        scored.set(id, {
          product: p,
          score: (existing?.score ?? 0) + weightedScore,
        });
      });
      if (userBased.length > 0) sources.push('user-based');

      const collaborative = await RecommendationService.getCollaborativeRecommendations(
        userId,
        limit
      );
      collaborative.forEach((p, idx) => {
        const id = String(p._id);
        const weightedScore = (1 - idx / collaborative.length) * 0.2;
        const existing = scored.get(id);
        scored.set(id, {
          product: p,
          score: (existing?.score ?? 0) + weightedScore,
        });
      });
      if (collaborative.length > 0) sources.push('collaborative');
    }

    // Fallback to trending if no strategy fired
    if (scored.size === 0) {
      const trending = await Product.find({ isActive: true })
        .sort({ 'stats.purchaseCount': -1 })
        .limit(limit)
        .lean<IProduct[]>();
      trending.forEach((p) => scored.set(String(p._id), { product: p, score: 0 }));
      sources.push('trending');
    }

    // Sort by combined score, de-duplicate, trim to limit
    const products = Array.from(scored.values())
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map((s) => s.product);

    const result = { products, source: sources };

    // Cache for 30 minutes
    try {
      await redisClient.setex(cacheKey, 1800, JSON.stringify(result));
    } catch {
      // Redis unavailable — skip caching
    }

    return result;
  }

  // ----------------------------------------
  // 6.1.6 Survey-Based Recommendations
  // ----------------------------------------

  /**
   * Map survey answers → scent profile → personalised recommendations.
   * Persists derived preferences to User and saves Survey record.
   */
  static async processSurveyForRecommendations(data: {
    userId?: string;
    answers: ISurveyAnswers;
  }): Promise<{
    products: IProduct[];
    comboMixes: IComboSuggestion[];
    derivedProfile: IScentProfile;
  }> {
    const { userId, answers } = data;

    // Map answers to scent profile
    const profile: IScentProfile = {
      preferredNotes: [...(answers.preferredNotes ?? [])],
      avoidNotes: [...(answers.avoidNotes ?? [])],
      scentFamilies: [],
    };

    // Occasion → notes
    if (answers.occasion === 'evening') {
      profile.preferredNotes.push('oud', 'amber', 'vanilla');
    } else if (answers.occasion === 'office') {
      profile.preferredNotes.push('fresh', 'citrus', 'lavender');
    } else if (answers.occasion === 'casual') {
      profile.preferredNotes.push('woody', 'musk');
    }

    // Intensity → scent family
    if (answers.intensity === 'strong' || answers.intensity === 'beast-mode') {
      profile.scentFamilies.push('oriental', 'woody');
    } else if (answers.intensity === 'light') {
      profile.scentFamilies.push('fresh', 'citrus', 'floral');
    }

    // Gender → category
    if (answers.gender) {
      profile.category = answers.gender;
    }

    // Budget → price range (NGN)
    if (answers.budget === 'premium' || answers.budget === 'luxury') {
      profile.budgetNGN = { min: 40000, max: 999999 };
    } else if (answers.budget === 'affordable') {
      profile.budgetNGN = { min: 0, max: 39999 };
    }

    // If authenticated, persist derived preferences to user profile
    if (userId) {
      await User.findByIdAndUpdate(userId, {
        $set: {
          scentPreferences: {
            preferredNotes: profile.preferredNotes,
            avoidNotes: profile.avoidNotes,
            intensity:
              answers.intensity === 'beast-mode'
                ? 'strong'
                : answers.intensity ?? 'moderate',
            occasions: answers.occasion ? [answers.occasion] : [],
          },
        },
      });
    }

    // Save survey result
    await Survey.create({
      userId: userId ?? undefined,
      sessionId: `survey-${Date.now()}`,
      derivedPreferences: {
        scentFamilies: profile.scentFamilies,
        intensity:
          answers.intensity === 'beast-mode' ? 'strong' : answers.intensity ?? 'moderate',
        occasions: answers.occasion ? [answers.occasion] : [],
        priceRange: {
          min: profile.budgetNGN?.min ?? 0,
          max: profile.budgetNGN?.max ?? 100000,
          currency: 'NGN',
        },
        gender: answers.gender ?? 'unisex',
      },
      status: 'completed',
      totalSteps: 7,
      currentStep: 7,
    });

    // Build product query from derived profile
    const productQuery: Record<string, unknown> = { isActive: true };
    if (profile.preferredNotes.length) {
      productQuery.$or = [
        { 'scentNotes.top': { $in: profile.preferredNotes } },
        { 'scentNotes.middle': { $in: profile.preferredNotes } },
        { 'scentNotes.base': { $in: profile.preferredNotes } },
      ];
    }
    if (profile.scentFamilies.length) {
      productQuery.scentFamily = { $in: profile.scentFamilies };
    }
    if (profile.category && profile.category !== 'unisex') {
      productQuery.category = { $in: [profile.category, 'unisex'] };
    }
    if (profile.budgetNGN) {
      productQuery.basePrice = {
        $gte: profile.budgetNGN.min,
        $lte: profile.budgetNGN.max,
      };
    }
    if (profile.avoidNotes.length) {
      productQuery['scentNotes.top'] = { $nin: profile.avoidNotes };
    }

    const products = await Product.find(productQuery)
      .sort({ 'stats.purchaseCount': -1 })
      .limit(10)
      .lean<IProduct[]>();

    // Combo mixes on top result
    const comboMixes: IComboSuggestion[] =
      products.length > 0
        ? await RecommendationService.getComboMixRecommendations(
            String(products[0]!._id)
          )
        : [];

    return { products, comboMixes, derivedProfile: profile };
  }

  // ----------------------------------------
  // 6.1.7 User Clustering (Churn & Segmentation)
  // ----------------------------------------

  /**
   * Segment all users by purchase behaviour.
   * Updates User.segment and User.churnRisk in bulk.
   */
  static async clusterUsersByBehaviour(): Promise<ISegmentSummary> {
    const users = await User.find({ role: 'user', isActive: true })
      .select('_id')
      .lean();

    const summary: ISegmentSummary = {
      vip: 0,
      loyal: 0,
      at_risk: 0,
      churned: 0,
      new: 0,
    };

    const now = Date.now();

    await Promise.all(
      users.map(async (u) => {
        const orders = await Order.find({
          userId: u._id,
          paymentStatus: 'paid',
        })
          .select('createdAt total')
          .sort({ createdAt: -1 })
          .lean();

        const totalOrders = orders.length;
        const lastOrderDate = orders[0]?.createdAt ?? null;
        const daysSinceLastOrder = lastOrderDate
          ? (now - new Date(lastOrderDate).getTime()) / 86400000
          : Infinity;
        const avgOrderValue =
          totalOrders > 0
            ? orders.reduce((sum, o) => sum + (o.total ?? 0), 0) / totalOrders
            : 0;

        // Assign segment
        let segment: keyof ISegmentSummary;
        let churnRisk = 0;

        if (totalOrders >= 5 && daysSinceLastOrder < 30) {
          segment = 'vip';
          churnRisk = 0.05;
        } else if (totalOrders >= 3 && daysSinceLastOrder < 60) {
          segment = 'loyal';
          churnRisk = 0.2;
        } else if (totalOrders >= 1 && daysSinceLastOrder >= 60 && daysSinceLastOrder <= 120) {
          segment = 'at_risk';
          churnRisk = 0.65;
        } else if (daysSinceLastOrder > 120) {
          segment = 'churned';
          churnRisk = 0.9;
        } else {
          segment = 'new';
          churnRisk = 0.3;
        }

        summary[segment] += 1;

        await User.findByIdAndUpdate(u._id, {
          $set: { segment, churnRisk },
        });

        // Suppress unused-var warning for avgOrderValue (used conceptually for churn risk calc)
        void avgOrderValue;
      })
    );

    return summary;
  }

  /**
   * Return users most at risk of churning (at_risk or churned), sorted by inactivity.
   */
  static async getChurnRiskUsers(limit: number = 50): Promise<IChurnRiskUser[]> {
    const users = await User.find({
      role: 'user',
      segment: { $in: ['at_risk', 'churned'] },
    })
      .select('_id email firstName churnRisk segment')
      .lean();

    const now = Date.now();

    const results = await Promise.all(
      users.map(async (u) => {
        const lastOrder = await Order.findOne({
          userId: u._id,
          paymentStatus: 'paid',
        })
          .sort({ createdAt: -1 })
          .select('createdAt total')
          .lean();

        const daysSinceLastOrder = lastOrder
          ? (now - new Date(lastOrder.createdAt).getTime()) / 86400000
          : Infinity;

        const allOrders = await Order.find({
          userId: u._id,
          paymentStatus: 'paid',
        })
          .select('total')
          .lean();

        const totalSpent = allOrders.reduce((sum, o) => sum + (o.total ?? 0), 0);

        return {
          userId: String(u._id),
          email: u.email,
          firstName: u.firstName,
          daysSinceLastOrder,
          totalSpent,
          segment: u.segment ?? 'unknown',
        };
      })
    );

    // Sort by longest inactive first
    return results
      .sort((a, b) => b.daysSinceLastOrder - a.daysSinceLastOrder)
      .slice(0, limit);
  }
}
