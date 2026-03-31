/**
 * Test Database & Redis Connection Script
 * Run with: npx ts-node-dev --esm src/scripts/test-connection.ts
 */

import 'dotenv/config';
import mongoose from 'mongoose';
import { Redis } from 'ioredis';

async function testConnections() {
  console.log('\n🧪 SCENTXURY CONNECTION TEST\n');
  console.log('='.repeat(50));
  
  // ========================================
  // TEST 1: MongoDB Connection
  // ========================================
  console.log('\n📦 Testing MongoDB Connection...\n');
  
  const mongoUri = process.env.MONGO_URI;
  
  if (!mongoUri) {
    console.error('❌ MONGO_URI is not set in .env file!');
    process.exit(1);
  }
  
  // Mask password in URI for display
  const maskedUri = mongoUri.replace(/:([^@]+)@/, ':****@');
  console.log(`   URI: ${maskedUri}`);
  
  try {
    await mongoose.connect(mongoUri, {
      maxPoolSize: 10,
      serverSelectionTimeoutMS: 10000,
    });
    
    console.log('   ✅ MongoDB Connected Successfully!');
    console.log(`   📍 Host: ${mongoose.connection.host}`);
    console.log(`   📁 Database: ${mongoose.connection.name}`);
    
    // Test write operation
    const testCollection = mongoose.connection.collection('_connection_test');
    await testCollection.insertOne({ 
      test: true, 
      timestamp: new Date(),
      message: 'Scentxury connection test' 
    });
    console.log('   ✅ Write operation successful');
    
    // Test read operation
    await testCollection.findOne({ test: true });
    console.log('   ✅ Read operation successful');
    
    // Cleanup
    await testCollection.drop();
    console.log('   🧹 Test collection cleaned up');
    
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error('   ❌ MongoDB Connection Failed!');
    console.error(`   Error: ${msg}`);

    if (msg.includes('ENOTFOUND')) {
      console.error('\n   💡 Tip: Check your MongoDB Atlas cluster URL');
    } else if (msg.includes('authentication')) {
      console.error('\n   💡 Tip: Check your username and password');
    } else if (msg.includes('IP')) {
      console.error('\n   💡 Tip: Add your IP to MongoDB Atlas Network Access');
    }
  }

  // ========================================
  // TEST 2: Redis Connection (Optional)
  // ========================================
  console.log('\n🔴 Testing Redis Connection...\n');
  
  const redisHost = process.env.REDIS_HOST || 'localhost';
  const redisPort = parseInt(process.env.REDIS_PORT || '6379');
  
  console.log(`   Host: ${redisHost}:${redisPort}`);
  
  try {
    const redis = new Redis({
      host: redisHost,
      port: redisPort,
      maxRetriesPerRequest: 3,
      connectTimeout: 5000,
      lazyConnect: true,
    });

    await redis.connect();
    
    // Test ping
    const pong = await redis.ping();
    console.log(`   ✅ Redis Connected! PING response: ${pong}`);
    
    // Test set/get
    await redis.set('scentxury:test', 'connection-successful');
    const value = await redis.get('scentxury:test');
    console.log(`   ✅ Read/Write test: ${value}`);
    
    // Cleanup
    await redis.del('scentxury:test');
    await redis.quit();
    
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    console.log('   ⚠️  Redis not available (optional for local dev)');
    console.log(`   Error: ${msg}`);
    console.log('\n   💡 Tip: Start Redis with Docker:');
    console.log('      docker run -d -p 6379:6379 redis:7-alpine');
  }

  // ========================================
  // SUMMARY
  // ========================================
  console.log('\n' + '='.repeat(50));
  console.log('📊 CONNECTION TEST COMPLETE\n');
  
  // Cleanup
  await mongoose.disconnect();
  process.exit(0);
}

testConnections().catch(console.error);
