/**
 * ============================================
 * ORDER MODEL
 * ============================================
 *
 * Order management with tracking, payment status,
 * and delivery information.
 *
 * @file src/models/Order.ts
 */

import mongoose, { Schema, Document, Model } from 'mongoose';

// ============================================
// INTERFACES
// ============================================

export interface IOrderItem {
  productId: mongoose.Types.ObjectId;
  productName: string;
  variantSku: string;
  variantSize: '20ml' | '50ml' | '100ml';
  quantity: number;
  unitPrice: number;
  costPrice: number;
  discount: number;
  total: number;
  image?: string;
}

export interface IShippingAddress {
  street: string;
  city: string;
  state: string;
  country: string;
  postalCode?: string;
  coordinates?: {
    lat: number;
    lng: number;
  };
  phone: string;
  recipientName: string;
}

export interface ITrackingEntry {
  status: string;
  timestamp: Date;
  note?: string;
  updatedBy?: mongoose.Types.ObjectId;
}

export type OrderStatus =
  | 'pending'
  | 'confirmed'
  | 'processing'
  | 'shipped'
  | 'out_for_delivery'
  | 'delivered'
  | 'cancelled'
  | 'refunded'
  | 'returned';

export type PaymentStatus = 'pending' | 'paid' | 'failed' | 'refunded';
export type PaymentMethod = 'paystack' | 'stripe' | 'bank_transfer' | 'cash_on_delivery';
export type DeliveryType = 'same_day' | 'next_day' | 'standard' | 'pickup';

export interface IOrder extends Document {
  orderNumber: string;
  userId: mongoose.Types.ObjectId;

  items: IOrderItem[];

  subtotal: number;
  discount: number;
  discountCode?: string;
  deliveryFee: number;
  total: number;

  currency: 'NGN' | 'USD';

  status: OrderStatus;
  paymentStatus: PaymentStatus;
  paymentMethod: PaymentMethod;
  paymentReference?: string;

  shippingAddress: IShippingAddress;

  deliveryType: DeliveryType;
  estimatedDelivery?: Date;
  actualDelivery?: Date;

  notes?: string;
  adminNotes?: string;

  trackingHistory: ITrackingEntry[];

  createdAt: Date;
  updatedAt: Date;
}

// ============================================
// SCHEMAS
// ============================================

const OrderItemSchema = new Schema<IOrderItem>(
  {
    productId: { type: Schema.Types.ObjectId, ref: 'Product', required: true },
    productName: { type: String, required: true },
    variantSku: { type: String, required: true },
    variantSize: {
      type: String,
      enum: ['20ml', '50ml', '100ml'],
      required: true,
    },
    quantity: { type: Number, required: true, min: 1 },
    unitPrice: { type: Number, required: true, min: 0 },
    costPrice: { type: Number, required: true, min: 0 },
    discount: { type: Number, default: 0 },
    total: { type: Number, required: true },
    image: String,
  },
  { _id: false }
);

const ShippingAddressSchema = new Schema<IShippingAddress>(
  {
    street: { type: String, required: [true, 'Street is required'] },
    city: { type: String, required: [true, 'City is required'] },
    state: { type: String, required: [true, 'State is required'] },
    country: { type: String, default: 'Nigeria' },
    postalCode: String,
    coordinates: {
      lat: Number,
      lng: Number,
    },
    phone: { type: String, required: [true, 'Phone is required'] },
    recipientName: { type: String, required: [true, 'Recipient name is required'] },
  },
  { _id: false }
);

const TrackingEntrySchema = new Schema<ITrackingEntry>(
  {
    status: { type: String, required: true },
    timestamp: { type: Date, default: Date.now },
    note: String,
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { _id: false }
);

const OrderSchema = new Schema<IOrder>(
  {
    orderNumber: { type: String, unique: true },
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'User ID is required'],
      index: true,
    },

    items: {
      type: [OrderItemSchema],
      required: true,
      validate: {
        validator: function (v: IOrderItem[]) {
          return v && v.length > 0;
        },
        message: 'Order must have at least one item',
      },
    },

    subtotal: { type: Number, required: true },
    discount: { type: Number, default: 0 },
    discountCode: String,
    deliveryFee: { type: Number, default: 0 },
    total: { type: Number, required: true },

    currency: { type: String, enum: ['NGN', 'USD'], default: 'NGN' },

    status: {
      type: String,
      enum: [
        'pending',
        'confirmed',
        'processing',
        'shipped',
        'out_for_delivery',
        'delivered',
        'cancelled',
        'refunded',
        'returned',
      ],
      default: 'pending',
      index: true,
    },

    paymentStatus: {
      type: String,
      enum: ['pending', 'paid', 'failed', 'refunded'],
      default: 'pending',
      index: true,
    },
    paymentMethod: {
      type: String,
      enum: ['paystack', 'stripe', 'bank_transfer', 'cash_on_delivery'],
      required: [true, 'Payment method is required'],
    },
    paymentReference: String,

    shippingAddress: {
      type: ShippingAddressSchema,
      required: [true, 'Shipping address is required'],
    },

    deliveryType: {
      type: String,
      enum: ['same_day', 'next_day', 'standard', 'pickup'],
      default: 'standard',
    },
    estimatedDelivery: Date,
    actualDelivery: Date,

    notes: String,
    adminNotes: String,

    trackingHistory: [TrackingEntrySchema],
  },
  {
    timestamps: true,
  }
);

// ============================================
// INDEXES
// ============================================

OrderSchema.index({ createdAt: -1 });
OrderSchema.index({ status: 1, createdAt: -1 });
OrderSchema.index({ 'items.productId': 1 });

// ============================================
// PRE-SAVE HOOKS
// ============================================

// Generate order number
OrderSchema.pre('save', async function () {
  if (!this.orderNumber) {
    const date = new Date();
    const prefix = `CHI${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}`;
    const count = await mongoose.model('Order').countDocuments();
    this.orderNumber = `${prefix}${String(count + 1).padStart(6, '0')}`;
  }
});

// Add to tracking history on status change
OrderSchema.pre('save', function () {
  if (this.isNew || this.isModified('status')) {
    this.trackingHistory.push({
      status: this.status,
      timestamp: new Date(),
    });
  }
});

// ============================================
// EXPORT
// ============================================

export const Order: Model<IOrder> =
  mongoose.models.Order || mongoose.model<IOrder>('Order', OrderSchema);

export default Order;
