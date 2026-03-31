// MongoDB Initialization Script
// This runs when the MongoDB container is first created

// Switch to scentxury database
db = db.getSiblingDB('scentxury');

// Create collections with validation schemas
db.createCollection('users', {
  validator: {
    $jsonSchema: {
      bsonType: 'object',
      required: ['email'],
      properties: {
        email: {
          bsonType: 'string',
          description: 'Email is required'
        },
        role: {
          enum: ['user', 'admin'],
          description: 'Role must be user or admin'
        }
      }
    }
  }
});

db.createCollection('products', {
  validator: {
    $jsonSchema: {
      bsonType: 'object',
      required: ['name', 'category'],
      properties: {
        name: {
          bsonType: 'string',
          description: 'Product name is required'
        },
        category: {
          enum: ['male', 'female', 'unisex', 'children', 'combo_mix'],
          description: 'Valid category required'
        }
      }
    }
  }
});

db.createCollection('orders');
db.createCollection('surveys');
db.createCollection('recommendations');
db.createCollection('referrals');

// Create indexes for performance
db.users.createIndex({ email: 1 }, { unique: true });
db.users.createIndex({ role: 1 });
db.products.createIndex({ name: 'text', description: 'text' });
db.products.createIndex({ category: 1 });
db.products.createIndex({ 'variants.sku': 1 });
db.orders.createIndex({ userId: 1 });
db.orders.createIndex({ status: 1 });
db.orders.createIndex({ createdAt: -1 });

print('✅ Scentxury database initialized successfully!');
print('📦 Collections created: users, products, orders, surveys, recommendations, referrals');
print('🔍 Indexes created for optimal query performance');
