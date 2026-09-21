// 1. Register uncaughtException handler immediately at top-level before any imports run
process.on('uncaughtException', (error) => {
  console.error('[FATAL] Uncaught Exception thrown:', error.name, error.message);
  console.error(error.stack);
  process.exit(1);
});

import { createApp } from './app.js';
import { env } from './config/env.js';
import { connectDatabase } from './config/database.js';

let server;

const startServer = async () => {
  // Initialize Database connection
  await connectDatabase();

  const app = createApp();

  server = app.listen(env.port, () => {
    console.log(`=============================================`);
    console.log(`🚀 FoodSaver API is running!`);
    console.log(`📡 Environment : ${env.nodeEnv}`);
    console.log(`🌐 Local URL    : http://localhost:${env.port}`);
    console.log(`🔗 API Base URL : http://localhost:${env.port}${env.apiPrefix}`);
    console.log(`❤️  Health Check : http://localhost:${env.port}/health`);
    console.log(`=============================================`);
  });

  const handleShutdown = (signal) => {
    console.log(`\n[Server] Received ${signal}. Closing HTTP server gracefully...`);
    if (server) {
      server.close(() => {
        console.log('[Server] HTTP server closed cleanly. Exiting process.');
        process.exit(0);
      });
    } else {
      process.exit(0);
    }

    // Force close after 10 seconds timeout
    setTimeout(() => {
      console.error('[Server] Forceful shutdown initiated after timeout.');
      process.exit(1);
    }, 10000);
  };

  // Signal traps
  process.on('SIGINT', () => handleShutdown('SIGINT'));
  process.on('SIGTERM', () => handleShutdown('SIGTERM'));

  // 2. Register unhandledRejection handler
  process.on('unhandledRejection', (reason) => {
    console.error('[FATAL] Unhandled Promise Rejection:', reason);
    if (server) {
      server.close(() => {
        console.error('[Server] Process exiting due to unhandled promise rejection.');
        process.exit(1);
      });
    } else {
      process.exit(1);
    }
  });
};

startServer();
