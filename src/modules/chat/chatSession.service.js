import { prisma } from '../../config/database.js';
import { ApiError } from '../../shared/utils/apiError.js';

export const ChatSessionService = {
  /**
   * Danh sách tất cả cuộc trò chuyện của một user cụ thể
   */
  async listSessions(userId) {
    if (!userId) {
      throw ApiError.unauthorized('Yêu cầu đăng nhập để truy cập lịch sử trò chuyện');
    }

    const sessions = await prisma.chatSession.findMany({
      where: { userId },
      orderBy: { updatedAt: 'desc' },
      select: {
        id: true,
        title: true,
        createdAt: true,
        updatedAt: true,
        _count: {
          select: { messages: true }
        }
      }
    });

    return sessions.map((s) => ({
      id: s.id,
      title: s.title,
      createdAt: s.createdAt.getTime(),
      updatedAt: s.updatedAt.getTime(),
      messageCount: s._count.messages
    }));
  },

  /**
   * Lấy chi tiết một phiên trò chuyện kèm toàn bộ tin nhắn
   */
  async getSession(userId, sessionId) {
    if (!userId) {
      throw ApiError.unauthorized('Yêu cầu đăng nhập để truy cập cuộc trò chuyện');
    }
    if (!sessionId) {
      throw ApiError.badRequest('Mã phiên trò chuyện không hợp lệ');
    }

    const session = await prisma.chatSession.findFirst({
      where: {
        id: sessionId,
        userId
      },
      include: {
        messages: {
          orderBy: { createdAt: 'asc' }
        }
      }
    });

    if (!session) {
      throw ApiError.notFound('Không tìm thấy cuộc trò chuyện hoặc bạn không có quyền truy cập');
    }

    return {
      id: session.id,
      title: session.title,
      createdAt: session.createdAt.getTime(),
      updatedAt: session.updatedAt.getTime(),
      messages: session.messages.map((m) => ({
        id: m.id,
        role: m.role,
        content: m.content,
        timestamp: m.createdAt.toISOString(),
        richCards: m.richCards,
        quickSuggestions: m.quickSuggestions
      }))
    };
  },

  /**
   * Tạo phiên trò chuyện mới
   */
  async createSession(userId, { title = 'Cuộc trò chuyện mới' } = {}) {
    if (!userId) {
      throw ApiError.unauthorized('Yêu cầu đăng nhập để tạo cuộc trò chuyện');
    }

    const cleanTitle = (title || '').trim().slice(0, 255) || 'Cuộc trò chuyện mới';

    const session = await prisma.chatSession.create({
      data: {
        userId,
        title: cleanTitle
      }
    });

    return {
      id: session.id,
      title: session.title,
      createdAt: session.createdAt.getTime(),
      updatedAt: session.updatedAt.getTime(),
      messages: []
    };
  },

  /**
   * Đổi tên cuộc trò chuyện
   */
  async updateSessionTitle(userId, sessionId, title) {
    if (!userId) {
      throw ApiError.unauthorized('Yêu cầu đăng nhập');
    }

    const session = await prisma.chatSession.findFirst({
      where: { id: sessionId, userId }
    });

    if (!session) {
      throw ApiError.notFound('Không tìm thấy cuộc trò chuyện');
    }

    const cleanTitle = (title || '').trim().slice(0, 255);
    if (!cleanTitle) {
      throw ApiError.badRequest('Tiêu đề cuộc trò chuyện không được để trống');
    }

    const updated = await prisma.chatSession.update({
      where: { id: sessionId },
      data: { title: cleanTitle }
    });

    return {
      id: updated.id,
      title: updated.title,
      updatedAt: updated.updatedAt.getTime()
    };
  },

  /**
   * Xóa một cuộc trò chuyện (kiểm tra quyền sở hữu)
   */
  async deleteSession(userId, sessionId) {
    if (!userId) {
      throw ApiError.unauthorized('Yêu cầu đăng nhập');
    }

    const session = await prisma.chatSession.findFirst({
      where: { id: sessionId, userId }
    });

    if (!session) {
      throw ApiError.notFound('Không tìm thấy cuộc trò chuyện để xóa');
    }

    await prisma.chatSession.delete({
      where: { id: sessionId }
    });

    return { success: true, message: 'Đã xóa cuộc trò chuyện' };
  },

  /**
   * Lưu lượt hội thoại (tin nhắn người dùng và phản hồi trợ lý) vào Database
   */
  async persistTurn({ sessionId, userId, userMessage, assistantMessage, richCards, quickSuggestions }) {
    if (!userId || !sessionId) return null;

    try {
      let session = await prisma.chatSession.findFirst({
        where: { id: sessionId, userId }
      });

      // Nếu session chưa có trong DB (ví dụ client tự sinh UUID đầu tiên khi mở tab)
      if (!session) {
        let title = 'Cuộc trò chuyện mới';
        if (userMessage) {
          const clean = userMessage.replace(/\n/g, ' ').trim();
          title = clean.slice(0, 36).trim() + (clean.length > 36 ? '...' : '');
        }
        session = await prisma.chatSession.create({
          data: {
            id: sessionId,
            userId,
            title
          }
        });
      } else if (session.title === 'Cuộc trò chuyện mới' && userMessage) {
        // Tự động đặt tên theo câu nói đầu tiên của user
        const clean = userMessage.replace(/\n/g, ' ').trim();
        const autoTitle = clean.slice(0, 36).trim() + (clean.length > 36 ? '...' : '');
        await prisma.chatSession.update({
          where: { id: session.id },
          data: { title: autoTitle }
        });
      }

      // Lưu tin nhắn của User
      if (userMessage && userMessage.trim()) {
        await prisma.chatMessage.create({
          data: {
            sessionId: session.id,
            role: 'user',
            content: userMessage.trim()
          }
        });
      }

      // Lưu tin nhắn phản hồi của Assistant
      if (assistantMessage && assistantMessage.trim()) {
        await prisma.chatMessage.create({
          data: {
            sessionId: session.id,
            role: 'assistant',
            content: assistantMessage.trim(),
            richCards: richCards || null,
            quickSuggestions: quickSuggestions || null
          }
        });
      }

      // Cập nhật updatedAt của session
      await prisma.chatSession.update({
        where: { id: session.id },
        data: { updatedAt: new Date() }
      });

      return session;
    } catch (err) {
      console.error('[ChatSessionService.persistTurn Error]:', err.message);
      return null;
    }
  }
};
