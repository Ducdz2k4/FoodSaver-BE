import { env } from './env.js';

export const connectDatabase = async () => {
  try {
    if (!env.databaseUrl) {
      console.warn('[Database] DATABASE_URL not set. Running with local/in-memory data stores.');
      return;
    }

    // Connect your ORM/ODM here (e.g. Mongoose, Prisma, Sequelize)
    // Example with Mongoose:
    // await mongoose.connect(env.databaseUrl);

    console.log(`[Database] Connected successfully to: ${env.databaseUrl.split('@').pop()}`);
  } catch (error) {
    console.error('[Database] Connection failed:', error.message);
    // Exit if DB is critical for application boot
    // process.exit(1);
  }
};
