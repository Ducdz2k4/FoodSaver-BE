import { Server as SocketIOServer } from 'socket.io';
import { verifyAccessToken } from '../shared/utils/jwt.js';
import { env } from './env.js';

let io = null;

export const initSocket = (httpServer) => {
  io = new SocketIOServer(httpServer, {
    cors: {
      origin: (origin, callback) => {
        // Allow all local dev origins
        if (!origin || !env.isProduction || origin.includes('localhost') || origin.includes('127.0.0.1')) {
          return callback(null, true);
        }
        if (Array.isArray(env.corsOrigin) && env.corsOrigin.includes(origin)) {
          return callback(null, true);
        }
        return callback(null, true);
      },
      credentials: true,
      methods: ['GET', 'POST']
    }
  });

  // Socket authentication middleware (optional token handshake)
  io.use((socket, next) => {
    const token = socket.handshake.auth?.token || socket.handshake.query?.token;
    if (token && typeof token === 'string' && !token.startsWith('mock-')) {
      try {
        const decoded = verifyAccessToken(token.replace('Bearer ', ''));
        socket.user = decoded;
      } catch {
        // Invalid token, continue as guest
      }
    }
    next();
  });

  io.on('connection', (socket) => {
    const userId = socket.user?.id;
    if (userId) {
      socket.join(`user:${userId}`);
      console.log(`[Socket.IO] Authenticated user connected: ${userId} (${socket.id})`);
    } else {
      console.log(`[Socket.IO] Guest connected: ${socket.id}`);
    }

    // Allow client to join partner specific room
    socket.on('join_partner', (partnerId) => {
      if (partnerId) {
        socket.join(`partner:${partnerId}`);
        console.log(`[Socket.IO] Socket ${socket.id} joined partner:${partnerId}`);
      }
    });

    socket.on('disconnect', () => {
      console.log(`[Socket.IO] Client disconnected: ${socket.id}`);
    });
  });

  console.log('✅ Socket.IO Server initialized successfully');
  return io;
};

export const getIO = () => {
  if (!io) {
    console.warn('[Socket.IO] Instance not initialized yet');
  }
  return io;
};

export const emitToUser = (userId, event, payload) => {
  if (io && userId) {
    io.to(`user:${userId}`).emit(event, payload);
  }
};

export const emitToPartner = (partnerId, event, payload) => {
  if (io && partnerId) {
    io.to(`partner:${partnerId}`).emit(event, payload);
  }
};

export const broadcastEvent = (event, payload) => {
  if (io) {
    io.emit(event, payload);
  }
};
