/**
 * ============================================
 * SURVEY MODEL
 * ============================================
 *
 * Scent preference questionnaire for personalized
 * product recommendations. Supports both authenticated
 * and anonymous (guest) surveys.
 *
 * @file src/models/Survey.ts
 */

import mongoose, { Schema, Document, Model } from 'mongoose';

// ============================================
// INTERFACES
// ============================================

export interface ISurveyResponse {
  questionId: string;
  questionText: string;
  answer: string | string[];
  weight: number;
}

export interface IDerivedPreferences {
  scentFamilies: string[];
  intensity: 'light' | 'moderate' | 'strong';
  occasions: string[];
  priceRange: {
    min: number;
    max: number;
    currency: 'NGN' | 'USD';
  };
  gender: 'male' | 'female' | 'unisex';
}

export interface IRecommendedProduct {
  productId: mongoose.Types.ObjectId;
  score: number;
  reason: string;
}

export type SurveyStatus = 'in_progress' | 'completed' | 'abandoned';

export interface ISurvey extends Document {
  userId?: mongoose.Types.ObjectId;
  sessionId: string;

  responses: ISurveyResponse[];
  currentStep: number;
  totalSteps: number;

  derivedPreferences?: IDerivedPreferences;
  recommendedProducts: IRecommendedProduct[];

  status: SurveyStatus;
  startedAt: Date;
  completedAt?: Date;
  abandonedAt?: Date;

  deviceInfo?: {
    userAgent: string;
    platform: string;
    screenSize?: string;
  };

  source: 'web' | 'mobile' | 'chatbot';

  createdAt: Date;
  updatedAt: Date;

  // Methods
  calculateProgress(): number;
  addResponse(response: ISurveyResponse): void;
}

// ============================================
// SCHEMAS
// ============================================

const SurveyResponseSchema = new Schema<ISurveyResponse>(
  {
    questionId: { type: String, required: true },
    questionText: { type: String, required: true },
    answer: { type: Schema.Types.Mixed, required: true },
    weight: { type: Number, default: 1, min: 0, max: 10 },
  },
  { _id: false }
);

const DerivedPreferencesSchema = new Schema<IDerivedPreferences>(
  {
    scentFamilies: [{ type: String, lowercase: true }],
    intensity: {
      type: String,
      enum: ['light', 'moderate', 'strong'],
      default: 'moderate',
    },
    occasions: [{ type: String, lowercase: true }],
    priceRange: {
      min: { type: Number, default: 0 },
      max: { type: Number, default: 100000 },
      currency: { type: String, enum: ['NGN', 'USD'], default: 'NGN' },
    },
    gender: {
      type: String,
      enum: ['male', 'female', 'unisex'],
      default: 'unisex',
    },
  },
  { _id: false }
);

const RecommendedProductSchema = new Schema<IRecommendedProduct>(
  {
    productId: { type: Schema.Types.ObjectId, ref: 'Product', required: true },
    score: { type: Number, required: true, min: 0, max: 100 },
    reason: { type: String, required: true },
  },
  { _id: false }
);

const DeviceInfoSchema = new Schema(
  {
    userAgent: String,
    platform: String,
    screenSize: String,
  },
  { _id: false }
);

const SurveySchema = new Schema<ISurvey>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      index: true,
    },
    sessionId: {
      type: String,
      required: [true, 'Session ID is required'],
      index: true,
    },

    responses: [SurveyResponseSchema],
    currentStep: { type: Number, default: 1, min: 1 },
    totalSteps: { type: Number, default: 10, min: 1 },

    derivedPreferences: DerivedPreferencesSchema,
    recommendedProducts: [RecommendedProductSchema],

    status: {
      type: String,
      enum: ['in_progress', 'completed', 'abandoned'],
      default: 'in_progress',
      index: true,
    },
    startedAt: { type: Date, default: Date.now },
    completedAt: Date,
    abandonedAt: Date,

    deviceInfo: DeviceInfoSchema,
    source: {
      type: String,
      enum: ['web', 'mobile', 'chatbot'],
      default: 'web',
    },
  },
  {
    timestamps: true,
  }
);

// ============================================
// INDEXES
// ============================================

SurveySchema.index({ createdAt: -1 });
SurveySchema.index({ status: 1, createdAt: -1 });
SurveySchema.index({ userId: 1, status: 1 });

// ============================================
// METHODS
// ============================================

/**
 * Calculate survey completion progress as percentage
 */
SurveySchema.methods.calculateProgress = function (): number {
  return Math.round((this.currentStep / this.totalSteps) * 100);
};

/**
 * Add a response and advance to next step
 */
SurveySchema.methods.addResponse = function (response: ISurveyResponse): void {
  this.responses.push(response);
  if (this.currentStep < this.totalSteps) {
    this.currentStep += 1;
  }
};

// ============================================
// PRE-SAVE HOOKS
// ============================================

// Update status timestamps
SurveySchema.pre('save', function () {
  if (this.isModified('status')) {
    if (this.status === 'completed' && !this.completedAt) {
      this.completedAt = new Date();
    }
    if (this.status === 'abandoned' && !this.abandonedAt) {
      this.abandonedAt = new Date();
    }
  }
});

// ============================================
// EXPORT
// ============================================

export const Survey: Model<ISurvey> =
  mongoose.models.Survey || mongoose.model<ISurvey>('Survey', SurveySchema);

export default Survey;
