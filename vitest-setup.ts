import 'dotenv/config';

// Route-level Admin tests use a test-only identity, independent of .env.example.
process.env.ADMIN_PUBKEYS = '0f'.repeat(32);
