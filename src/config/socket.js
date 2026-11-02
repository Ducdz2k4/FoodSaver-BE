import { Server as SocketIOServer } from 'socket.io';
import { verifyAccessToken } from '../shared/utils/jwt.js';
import { env } from './env.js';
import { UserModel } from '../modules/users/user.model.js';

let io = null;

export const initSocket = (httpServer) => {
  io = new SocketIOServer(httpServer, {
    cors: {
      origin: (origin, callback) => {
        if (!origin || !env.isProduction) {
          return callback(null, true);
        }
        if (Array.isArray(env.corsOrigin) && env.corsOrigin.includes(origin)) {
          return callback(null, true);
        }
        return callback(null, false);
      },
      credentials: true,
      methods: ['GET', 'POST', 'PATCH']
    }
  });

  // Socket authentication middleware
  io.use(async (socket, next) => {
    const token = socket.handshake.auth?.token || socket.handshake.query?.token;
    if (token && typeof token === 'string') {
      try {
        const decoded = verifyAccessToken(token.replace('Bearer ', ''));
        const user = await UserModel.findById(decoded.id);
        if (!user || user.status !== 'ACTIVE' || user.passwordSetupRequired) {
          return next(new Error('Unauthorized'));
        }
        socket.user = user;
      } catch {
        return next(new Error('Unauthorized'));
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
      if (partnerId && socket.user?.partnerProfileId === partnerId && socket.user?.partnerCapability === 'VERIFIED') {
        socket.join(`partner:${partnerId}`);
      }
    });

    // Realtime Bargain Shipping Fee Events
    socket.on('BARGAIN_SHIPPING_REQUEST', (data) => {
      // User sends bargain request to partner
      // data: { partnerId, orderNumber, customerId, customerName, defaultFee, proposedFee, distanceKm }
      if (socket.user && typeof data?.partnerId === 'string') {
        if (!Number.isFinite(data.proposedFee) || data.proposedFee < 0 || data.proposedFee > 60000) return;
        io.to(`partner:${data.partnerId}`).emit('RECEIVE_BARGAIN_REQUEST', {
          ...data,
          customerId: socket.user.id,
          customerName: socket.user.fullName,
          senderSocketId: socket.id
        });
      }
    });

    socket.on('BARGAIN_SHIPPING_RESPONSE', (data) => {
      // Partner responds to customer (accepted, rejected, or counter-offer)
      // data: { customerId, accepted, finalFee, message }
      if (socket.user?.partnerCapability === 'VERIFIED' && typeof data?.customerId === 'string') {
        if (typeof data.accepted !== 'boolean' || !Number.isFinite(data.finalFee) || data.finalFee < 0 || data.finalFee > 60000) return;
        io.to(`user:${data.customerId}`).emit('RECEIVE_BARGAIN_RESPONSE', {
          ...data,
          partnerId: socket.user.partnerProfileId
        });
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
