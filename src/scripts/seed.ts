/**
 * ============================================
 * ADMIN SEED SCRIPT
 * ============================================
 *
 * Creates the first admin account or promotes an existing user.
 *
 * Usage:
 *   npm run db:seed
 *   npm run db:seed -- --email admin@scentxury.com --password Secret123!
 *
 * Env var overrides:
 *   ADMIN_EMAIL, ADMIN_PASSWORD, ADMIN_FIRST_NAME, ADMIN_LAST_NAME
 *
 * @file src/scripts/seed.ts
 */

import 'dotenv/config';
import mongoose from 'mongoose';
import { User } from '../models/User.js';

// ============================================
// PARSE ARGS
// ============================================

function getArg(flag: string): string | undefined {
  const idx = process.argv.indexOf(flag);
  return idx !== -1 ? process.argv[idx + 1] : undefined;
}

const config = {
  email:
    getArg('--email') ||
    process.env.ADMIN_EMAIL ||
    'admin@scentxury.com',
  password:
    getArg('--password') ||
    process.env.ADMIN_PASSWORD ||
    'Admin@Scentxury1',
  firstName:
    getArg('--firstName') ||
    process.env.ADMIN_FIRST_NAME ||
    'Chi',
  lastName:
    getArg('--lastName') ||
    process.env.ADMIN_LAST_NAME ||
    'Admin',
};

// ============================================
// SEED
// ============================================

async function seed(): Promise<void> {
  const mongoUri =
    process.env.MONGO_URI || 'mongodb://localhost:27017/scentxury';

  console.log('\n🌱 SCENTXURY ADMIN SEED\n' + '='.repeat(40));
  console.log(`   MongoDB: ${mongoUri.replace(/:([^@]+)@/, ':****@')}`);
  console.log(`   Email  : ${config.email}`);
  console.log('='.repeat(40) + '\n');

  await mongoose.connect(mongoUri, { serverSelectionTimeoutMS: 10_000 });
  console.log('✅ Connected to MongoDB\n');

  const existing = await User.findOne({ email: config.email.toLowerCase() });

  if (existing) {
    if (existing.role === 'admin') {
      console.log(`ℹ️  User "${config.email}" already exists and is already an admin.`);
      console.log('   No changes made.\n');
    } else {
      existing.role = 'admin';
      await existing.save();
      console.log(`✅ Promoted existing user "${config.email}" to admin role.\n`);
    }
  } else {
    await User.create({
      email: config.email,
      password: config.password,
      firstName: config.firstName,
      lastName: config.lastName,
      role: 'admin',
      isVerified: true,
      isActive: true,
    });

    console.log(`✅ Admin account created successfully!\n`);
    console.log('   Credentials:');
    console.log(`   Email    : ${config.email}`);
    console.log(`   Password : ${config.password}`);
    console.log('\n   ⚠️  Change this password immediately after first login.\n');
  }

  await mongoose.disconnect();
  console.log('✅ Done.\n');
  process.exit(0);
}

seed().catch((err) => {
  console.error('\n❌ Seed failed:', err.message);
  process.exit(1);
});
