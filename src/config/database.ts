import mongoose from 'mongoose';

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/scentxury';

export async function connectDatabase(): Promise<typeof mongoose> {
  try {
    const options = {
      maxPoolSize: 10,
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
    };

    const connection = await mongoose.connect(MONGO_URI, options);

    mongoose.connection.on('connected', () => {
      console.log('📦 MongoDB: Connected to database');
    });

    mongoose.connection.on('error', (err) => {
      console.error('📦 MongoDB: Connection error:', err);
    });

    mongoose.connection.on('disconnected', () => {
      console.log('📦 MongoDB: Disconnected from database');
    });

    // NOTE: Graceful shutdown is handled in server.ts to coordinate
    // all services (HTTP, Socket.io, Redis, MongoDB) properly.

    return connection;
  } catch (error) {
    console.error('📦 MongoDB: Failed to connect:', error);
    throw error;
  }
}

export async function disconnectDatabase(): Promise<void> {
  await mongoose.disconnect();
}

export { mongoose };
