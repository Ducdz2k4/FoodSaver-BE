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
    origin: env.corsOrigin === '*' ? '*' : env.corsOrigin,
    credentials: true
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
