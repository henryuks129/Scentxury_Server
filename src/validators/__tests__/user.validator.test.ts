/**
 * ============================================
 * USER VALIDATORS - TESTS
 * ============================================
 *
 * Tests for user profile, address, and preference validation schemas.
 *
 * @file src/validators/__tests__/user.validator.test.ts
 */

import { describe, it, expect } from 'vitest';
import {
  CreateAddressSchema,
  UpdateAddressSchema,
  UpdateScentPreferencesSchema,
  UpdateProfileSchema,
  PaginationSchema,
  ObjectIdSchema,
  AdminUpdateUserSchema,
  ListUsersQuerySchema,
  CoordinatesSchema,
} from '../user.validator.js';

// ============================================
// COORDINATES SCHEMA
// ============================================

describe('CoordinatesSchema', () => {
  it('should accept valid coordinates', () => {
    const result = CoordinatesSchema.safeParse({ lat: 6.5244, lng: 3.3792 });
    expect(result.success).toBe(true);
  });

  it('should accept boundary latitude values', () => {
    expect(CoordinatesSchema.safeParse({ lat: 90, lng: 0 }).success).toBe(true);
    expect(CoordinatesSchema.safeParse({ lat: -90, lng: 0 }).success).toBe(true);
  });

  it('should accept boundary longitude values', () => {
    expect(CoordinatesSchema.safeParse({ lat: 0, lng: 180 }).success).toBe(true);
    expect(CoordinatesSchema.safeParse({ lat: 0, lng: -180 }).success).toBe(true);
  });

  it('should reject latitude out of range', () => {
    expect(CoordinatesSchema.safeParse({ lat: 91, lng: 0 }).success).toBe(false);
    expect(CoordinatesSchema.safeParse({ lat: -91, lng: 0 }).success).toBe(false);
  });

  it('should reject longitude out of range', () => {
    expect(CoordinatesSchema.safeParse({ lat: 0, lng: 181 }).success).toBe(false);
    expect(CoordinatesSchema.safeParse({ lat: 0, lng: -181 }).success).toBe(false);
  });

  it('should reject missing fields', () => {
    expect(CoordinatesSchema.safeParse({ lat: 6.5 }).success).toBe(false);
    expect(CoordinatesSchema.safeParse({ lng: 3.3 }).success).toBe(false);
    expect(CoordinatesSchema.safeParse({}).success).toBe(false);
  });
});

// ============================================
// CREATE ADDRESS SCHEMA
// ============================================

describe('CreateAddressSchema', () => {
  const validAddress = {
    label: 'Home' as const,
    street: '123 Lagos Island Street',
    city: 'Lagos',
    state: 'Lagos',
    country: 'Nigeria',
    isDefault: false,
  };

  it('should accept a valid address', () => {
    const result = CreateAddressSchema.safeParse(validAddress);
    expect(result.success).toBe(true);
  });

  it('should apply default country to Nigeria', () => {
    const { country: _c, ...withoutCountry } = validAddress;
    const result = CreateAddressSchema.safeParse(withoutCountry);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.country).toBe('Nigeria');
    }
  });

  it('should apply default label to Home', () => {
    const { label: _l, ...withoutLabel } = validAddress;
    const result = CreateAddressSchema.safeParse(withoutLabel);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.label).toBe('Home');
    }
  });

  it('should trim whitespace from street, city, state', () => {
    const result = CreateAddressSchema.safeParse({
      ...validAddress,
      street: '  123 Lagos Island Street  ',
      city: '  Lagos  ',
      state: '  Lagos  ',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.street).toBe('123 Lagos Island Street');
      expect(result.data.city).toBe('Lagos');
      expect(result.data.state).toBe('Lagos');
    }
  });

  it('should accept optional coordinates', () => {
    const result = CreateAddressSchema.safeParse({
      ...validAddress,
      coordinates: { lat: 6.5244, lng: 3.3792 },
    });
    expect(result.success).toBe(true);
  });

  it('should accept optional postalCode', () => {
    const result = CreateAddressSchema.safeParse({
      ...validAddress,
      postalCode: '100001',
    });
    expect(result.success).toBe(true);
  });

  it('should reject invalid label', () => {
    const result = CreateAddressSchema.safeParse({
      ...validAddress,
      label: 'School',
    });
    expect(result.success).toBe(false);
  });

  it('should reject missing required street', () => {
    const { street: _s, ...withoutStreet } = validAddress;
    expect(CreateAddressSchema.safeParse(withoutStreet).success).toBe(false);
  });

  it('should reject missing required city', () => {
    const { city: _c, ...withoutCity } = validAddress;
    expect(CreateAddressSchema.safeParse(withoutCity).success).toBe(false);
  });

  it('should reject missing required state', () => {
    const { state: _s, ...withoutState } = validAddress;
    expect(CreateAddressSchema.safeParse(withoutState).success).toBe(false);
  });

  it('should reject street too short', () => {
    const result = CreateAddressSchema.safeParse({ ...validAddress, street: '123' });
    expect(result.success).toBe(false);
  });

  it('should reject street too long', () => {
    const result = CreateAddressSchema.safeParse({
      ...validAddress,
      street: 'A'.repeat(201),
    });
    expect(result.success).toBe(false);
  });
});

// ============================================
// UPDATE ADDRESS SCHEMA
// ============================================

describe('UpdateAddressSchema', () => {
  it('should accept partial address update', () => {
    expect(UpdateAddressSchema.safeParse({ city: 'Abuja' }).success).toBe(true);
    expect(UpdateAddressSchema.safeParse({ isDefault: true }).success).toBe(true);
    expect(UpdateAddressSchema.safeParse({ street: '456 New Street Way' }).success).toBe(true);
  });

  it('should accept empty object (all optional)', () => {
    expect(UpdateAddressSchema.safeParse({}).success).toBe(true);
  });

  it('should reject invalid label in update', () => {
    expect(UpdateAddressSchema.safeParse({ label: 'Gym' }).success).toBe(false);
  });
});

// ============================================
// UPDATE SCENT PREFERENCES SCHEMA
// ============================================

describe('UpdateScentPreferencesSchema', () => {
  const validPrefs = {
    preferredNotes: ['oud', 'vanilla', 'sandalwood'],
    avoidNotes: ['patchouli'],
    intensity: 'strong' as const,
    occasions: ['date', 'evening'],
  };

  it('should accept valid scent preferences', () => {
    const result = UpdateScentPreferencesSchema.safeParse(validPrefs);
    expect(result.success).toBe(true);
  });

  it('should accept partial preferences update', () => {
    expect(UpdateScentPreferencesSchema.safeParse({ intensity: 'light' }).success).toBe(true);
    expect(UpdateScentPreferencesSchema.safeParse({ preferredNotes: ['rose'] }).success).toBe(true);
    expect(UpdateScentPreferencesSchema.safeParse({}).success).toBe(true);
  });

  it('should reject invalid intensity value', () => {
    const result = UpdateScentPreferencesSchema.safeParse({ intensity: 'extreme' });
    expect(result.success).toBe(false);
  });

  it('should reject more than 20 preferred notes', () => {
    const result = UpdateScentPreferencesSchema.safeParse({
      preferredNotes: Array(21).fill('oud'),
    });
    expect(result.success).toBe(false);
  });

  it('should reject more than 10 occasions', () => {
    const result = UpdateScentPreferencesSchema.safeParse({
      occasions: Array(11).fill('daily'),
    });
    expect(result.success).toBe(false);
  });

  it('should reject empty note string', () => {
    const result = UpdateScentPreferencesSchema.safeParse({
      preferredNotes: ['oud', ''],
    });
    expect(result.success).toBe(false);
  });
});

// ============================================
// UPDATE PROFILE SCHEMA
// ============================================

describe('UpdateProfileSchema', () => {
  it('should accept valid profile update with first name', () => {
    const result = UpdateProfileSchema.safeParse({ firstName: 'Amaka' });
    expect(result.success).toBe(true);
  });

  it('should accept valid profile update with last name', () => {
    const result = UpdateProfileSchema.safeParse({ lastName: 'Okonkwo' });
    expect(result.success).toBe(true);
  });

  it('should accept valid Nigerian phone number', () => {
    const result = UpdateProfileSchema.safeParse({ phone: '+2348012345678' });
    expect(result.success).toBe(true);
  });

  it('should accept valid avatar URL', () => {
    const result = UpdateProfileSchema.safeParse({
      avatar: 'https://res.cloudinary.com/demo/image/upload/sample.jpg',
    });
    expect(result.success).toBe(true);
  });

  it('should accept full profile update', () => {
    const result = UpdateProfileSchema.safeParse({
      firstName: 'Chidi',
      lastName: 'Okeke',
      phone: '08012345678',
      avatar: 'https://example.com/avatar.png',
    });
    expect(result.success).toBe(true);
  });

  it('should reject empty object (at least one field required)', () => {
    const result = UpdateProfileSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it('should reject first name too short', () => {
    const result = UpdateProfileSchema.safeParse({ firstName: 'A' });
    expect(result.success).toBe(false);
  });

  it('should reject first name too long', () => {
    const result = UpdateProfileSchema.safeParse({ firstName: 'A'.repeat(101) });
    expect(result.success).toBe(false);
  });

  it('should reject invalid avatar URL', () => {
    const result = UpdateProfileSchema.safeParse({ avatar: 'not-a-url' });
    expect(result.success).toBe(false);
  });

  it('should reject name with invalid characters', () => {
    const result = UpdateProfileSchema.safeParse({ firstName: 'John123' });
    expect(result.success).toBe(false);
  });

  it('should trim whitespace from names', () => {
    const result = UpdateProfileSchema.safeParse({ firstName: '  Emeka  ' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.firstName).toBe('Emeka');
    }
  });
});

// ============================================
// PAGINATION SCHEMA
// ============================================

describe('PaginationSchema', () => {
  it('should apply defaults when no params provided', () => {
    const result = PaginationSchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.page).toBe(1);
      expect(result.data.limit).toBe(20);
    }
  });

  it('should coerce string numbers', () => {
    const result = PaginationSchema.safeParse({ page: '2', limit: '10' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.page).toBe(2);
      expect(result.data.limit).toBe(10);
    }
  });

  it('should reject page less than 1', () => {
    expect(PaginationSchema.safeParse({ page: 0 }).success).toBe(false);
    expect(PaginationSchema.safeParse({ page: -1 }).success).toBe(false);
  });

  it('should reject limit greater than 100', () => {
    expect(PaginationSchema.safeParse({ limit: 101 }).success).toBe(false);
  });

  it('should accept valid sort field with optional desc prefix', () => {
    expect(PaginationSchema.safeParse({ sort: 'createdAt' }).success).toBe(true);
    expect(PaginationSchema.safeParse({ sort: '-createdAt' }).success).toBe(true);
  });

  it('should reject invalid sort field', () => {
    expect(PaginationSchema.safeParse({ sort: 'field; DROP TABLE' }).success).toBe(false);
  });
});

// ============================================
// OBJECT ID SCHEMA
// ============================================

describe('ObjectIdSchema', () => {
  it('should accept valid 24-char hex ObjectId', () => {
    expect(ObjectIdSchema.safeParse('507f1f77bcf86cd799439011').success).toBe(true);
    expect(ObjectIdSchema.safeParse('64a3b2c1e5f0a1b2c3d4e5f6').success).toBe(true);
  });

  it('should reject ObjectId with wrong length', () => {
    expect(ObjectIdSchema.safeParse('507f1f77bcf86cd79943901').success).toBe(false); // 23 chars
    expect(ObjectIdSchema.safeParse('507f1f77bcf86cd7994390111').success).toBe(false); // 25 chars
  });

  it('should reject ObjectId with invalid characters', () => {
    expect(ObjectIdSchema.safeParse('507f1f77bcf86cd79943901z').success).toBe(false);
    expect(ObjectIdSchema.safeParse('507f1f77bcf86cd7994390 1').success).toBe(false);
  });

  it('should reject empty string', () => {
    expect(ObjectIdSchema.safeParse('').success).toBe(false);
  });
});

// ============================================
// ADMIN UPDATE USER SCHEMA
// ============================================

describe('AdminUpdateUserSchema', () => {
  it('should accept valid role update', () => {
    expect(AdminUpdateUserSchema.safeParse({ role: 'admin' }).success).toBe(true);
    expect(AdminUpdateUserSchema.safeParse({ role: 'user' }).success).toBe(true);
  });

  it('should accept valid isActive update', () => {
    expect(AdminUpdateUserSchema.safeParse({ isActive: false }).success).toBe(true);
    expect(AdminUpdateUserSchema.safeParse({ isActive: true }).success).toBe(true);
  });

  it('should accept valid isVerified update', () => {
    expect(AdminUpdateUserSchema.safeParse({ isVerified: true }).success).toBe(true);
  });

  it('should accept multiple fields', () => {
    const result = AdminUpdateUserSchema.safeParse({
      role: 'admin',
      isActive: true,
      isVerified: true,
    });
    expect(result.success).toBe(true);
  });

  it('should reject empty object (at least one field required)', () => {
    expect(AdminUpdateUserSchema.safeParse({}).success).toBe(false);
  });

  it('should reject invalid role value', () => {
    expect(AdminUpdateUserSchema.safeParse({ role: 'superadmin' }).success).toBe(false);
  });
});

// ============================================
// LIST USERS QUERY SCHEMA
// ============================================

describe('ListUsersQuerySchema', () => {
  it('should accept valid query with all filters', () => {
    const result = ListUsersQuerySchema.safeParse({
      page: '1',
      limit: '20',
      role: 'user',
      isActive: 'true',
      search: 'chi',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.isActive).toBe(true);
      expect(result.data.page).toBe(1);
    }
  });

  it('should apply defaults when no params provided', () => {
    const result = ListUsersQuerySchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.page).toBe(1);
      expect(result.data.limit).toBe(20);
    }
  });

  it('should reject invalid role filter', () => {
    expect(ListUsersQuerySchema.safeParse({ role: 'guest' }).success).toBe(false);
  });

  it('should reject search string too long', () => {
    expect(ListUsersQuerySchema.safeParse({ search: 'A'.repeat(201) }).success).toBe(false);
  });

  it('should transform isActive string to boolean', () => {
    const result = ListUsersQuerySchema.safeParse({ isActive: 'false' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.isActive).toBe(false);
    }
  });
});
