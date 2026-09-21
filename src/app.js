import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import { env } from './config/env.js';
import { appRouter } from './routes/index.js';
import { notFound } from './shared/middlewares/notFound.js';
import { errorHandler } from './shared/middlewares/errorHandler.js';

export const createApp = () => {
  const app = express();

  // Security & utility middlewares
  app.use(helmet());
  app.use(cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (e.g. mobile apps, curl, server-to-server)
      if (!origin) return callback(null, true);

      // In development, allow all localhost and 127.0.0.1 origins
      if (!env.isProduction || origin.includes('localhost') || origin.includes('127.0.0.1')) {
        return callback(null, true);
      }

      if (Array.isArray(env.corsOrigin) && env.corsOrigin.includes(origin)) {
        return callback(null, true);
      }

      return callback(null, true);
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
  }));
  app.use(morgan(env.isProduction ? 'combined' : 'dev'));
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  // Health check endpoint
  app.get('/health', (_req, res) => {
    res.status(200).json({
      status: 'ok',
      uptime: process.uptime(),
      timestamp: new Date().toISOString()
    });
  });

  // Base API info
  app.get('/', (_req, res) => {
    res.status(200).json({
      name: 'FoodSaver Backend API',
      version: '1.0.0',
      docs: `${env.apiPrefix}`,
      architecture: 'Modular MVC (Domain-driven)'
    });
  });

  // Mount API routes
  app.use(env.apiPrefix, appRouter);

  // 404 handler for undefined routes
  app.use(notFound);

  // Centralized error handler
  app.use(errorHandler);

  return app;
};
