import { Server as SocketIOServer } from 'socket.io';
import { verifyAccessToken } from '../shared/utils/jwt.js';
import { env } from './env.js';

let io = null;

export const initSocket = (httpServer) => {
  io = new SocketIOServer(httpServer, {
    cors: {
      origin: (origin, callback) => {
        if (!origin || !env.isProduction || origin.includes('localhost') || origin.includes('127.0.0.1')) {
          return callback(null, true);
        }
        if (Array.isArray(env.corsOrigin) && env.corsOrigin.includes(origin)) {
          return callback(null, true);
        }
        return callback(null, true);
      },
      credentials: true,
      methods: ['GET', 'POST', 'PATCH']
    }
  });

  // Socket authentication middleware
  io.use((socket, next) => {
    const token = socket.handshake.auth?.token || socket.handshake.query?.token;
    if (token && typeof token === 'string' && !token.startsWith('mock-')) {
      try {
        const decoded = verifyAccessToken(token.replace('Bearer ', ''));
        socket.user = decoded;
      } catch {
        // Continue as guest
      }
    }
    next();
  });

  io.on('connection', (socket) => {
    const userId = socket.user?.id;
    if (userId) {
      socket.join(`user:${userId}`);
    }

    // Join partner room
    socket.on('join_partner', (partnerId) => {
      if (partnerId) {
        socket.join(`partner:${partnerId}`);
      }
    });

    // Realtime Bargain Shipping Fee Events
    socket.on('BARGAIN_SHIPPING_REQUEST', (data) => {
      // User sends bargain request to partner
      // data: { partnerId, orderNumber, customerId, customerName, defaultFee, proposedFee, distanceKm }
      if (data?.partnerId) {
        io.to(`partner:${data.partnerId}`).emit('RECEIVE_BARGAIN_REQUEST', {
          ...data,
          senderSocketId: socket.id
        });
      }
    });

    socket.on('BARGAIN_SHIPPING_RESPONSE', (data) => {
      // Partner responds to customer (accepted, rejected, or counter-offer)
      // data: { customerId, accepted, finalFee, message }
      if (data?.customerId) {
        io.to(`user:${data.customerId}`).emit('RECEIVE_BARGAIN_RESPONSE', data);
      }
    });

    socket.on('disconnect', () => {});
  });

  console.log('✅ Socket.IO Server initialized with Bargaining Channels');
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
