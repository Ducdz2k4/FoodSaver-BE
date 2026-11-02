import { processChatMessage, streamChatPipeline } from './chat.service.js';
import { getUserFacts, deleteUserFact, clearSessionMemory, getChatSessionId } from './memory.service.js';
import { ChatSessionService } from './chatSession.service.js';
import { ApiResponse } from '../../shared/utils/apiResponse.js';
import { asyncHandler } from '../../shared/utils/asyncHandler.js';
import { ApiError } from '../../shared/utils/apiError.js';

export const chatController = {
  /**
   * Standard JSON completion (Powered by Groq openai/gpt-oss-120b)
   */
  sendMessage: asyncHandler(async (req, res) => {
    const { message, sessionId } = req.body;
    const user = req.user || null;
    const userId = user?.id || null;

    if (!message || typeof message !== 'string' || !message.trim()) {
      throw ApiError.badRequest('Nội dung tin nhắn không được để trống');
    }

    const result = await processChatMessage({
      message: message.trim(),
      userId,
      sessionId,
      user
    });

    // Bền vững: Lưu turn hội thoại vào Database nếu người dùng đã đăng nhập
    if (userId && sessionId) {
      await ChatSessionService.persistTurn({
        sessionId,
        userId,
        userMessage: message.trim(),
        assistantMessage: result.reply,
        richCards: result.richCards,
        quickSuggestions: result.quickSuggestions
      });
    }

    return ApiResponse.success(res, {
      message: 'Xử lý tin nhắn thành công',
      data: result
    });
  }),

  /**
   * Server-Sent Events (SSE) Real-Time Streaming completion
   */
  streamMessage: asyncHandler(async (req, res) => {
    const { message, sessionId } = req.body;
    const user = req.user || null;
    const userId = user?.id || null;

    if (!message || typeof message !== 'string' || !message.trim()) {
      return res.status(400).json({ success: false, message: 'Nội dung tin nhắn không được để trống' });
    }

    // Set headers for SSE streaming
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();

    try {
      const { pipeline, fullReply } = await streamChatPipeline({
        message: message.trim(),
        userId,
        sessionId,
        user,
        onToken: (tok) => {
          res.write(`data: ${JSON.stringify({ type: 'token', content: tok })}\n\n`);
        }
      });

      // Stream rich cards and suggestions at the end
      res.write(`data: ${JSON.stringify({
        type: 'done',
        intent: pipeline.intent,
        richCards: pipeline.richCards,
        quickSuggestions: pipeline.quickSuggestions,
        profileContext: pipeline.context.profile
      })}\n\n`);

      res.end();

      // Bền vững: Lưu turn hội thoại vào Database nếu người dùng đã đăng nhập
      if (userId && sessionId) {
        ChatSessionService.persistTurn({
          sessionId,
          userId,
          userMessage: message.trim(),
          assistantMessage: fullReply,
          richCards: pipeline.richCards,
          quickSuggestions: pipeline.quickSuggestions
        }).catch((err) => console.error('[PersistTurn SSE Error]:', err.message));
      }
    } catch (err) {
      console.error('[Stream Controller Error]:', err.message);
      res.write(`data: ${JSON.stringify({ type: 'error', error: err.message })}\n\n`);
      res.end();
    }
  }),

  /**
   * Session Management endpoints (Yêu cầu JWT)
   */
  listSessions: asyncHandler(async (req, res) => {
    const sessions = await ChatSessionService.listSessions(req.user.id);
    return ApiResponse.success(res, {
      message: 'Lấy danh sách cuộc trò chuyện thành công',
      data: sessions
    });
  }),

  createSession: asyncHandler(async (req, res) => {
    const session = await ChatSessionService.createSession(req.user.id, req.body);
    return ApiResponse.created(res, {
      message: 'Tạo cuộc trò chuyện mới thành công',
      data: session
    });
  }),

  getSession: asyncHandler(async (req, res) => {
    const session = await ChatSessionService.getSession(req.user.id, req.params.id);
    return ApiResponse.success(res, {
      message: 'Chi tiết cuộc trò chuyện',
      data: session
    });
  }),

  updateSessionTitle: asyncHandler(async (req, res) => {
    const updated = await ChatSessionService.updateSessionTitle(req.user.id, req.params.id, req.body?.title);
    return ApiResponse.success(res, {
      message: 'Đổi tên cuộc trò chuyện thành công',
      data: updated
    });
  }),

  deleteSession: asyncHandler(async (req, res) => {
    const result = await ChatSessionService.deleteSession(req.user.id, req.params.id);
    return ApiResponse.success(res, {
      message: 'Xóa cuộc trò chuyện thành công',
      data: result
    });
  }),

  /**
   * Get user facts / transparency
   */
  getMemory: asyncHandler(async (req, res) => {
    const effectiveId = req.user?.id || getChatSessionId(null, req.query.sessionId);
    const facts = getUserFacts(effectiveId);
    return ApiResponse.success(res, {
      message: 'Lấy danh sách bộ nhớ thành công',
      data: facts
    });
  }),

  /**
   * Delete a specific fact
   */
  deleteMemoryKey: asyncHandler(async (req, res) => {
    const effectiveId = req.user?.id || getChatSessionId(null, req.body?.sessionId);
    const { key } = req.params;
    const deleted = deleteUserFact(effectiveId, key);
    return ApiResponse.success(res, {
      message: 'Xóa ký ức thành công',
      data: { deleted }
    });
  }),

  /**
   * Clear active session conversation history
   */
  clearSession: asyncHandler(async (req, res) => {
    const effectiveId = getChatSessionId(req.user?.id, req.body?.sessionId);
    clearSessionMemory(effectiveId);
    return ApiResponse.success(res, {
      message: 'Đã xóa lịch sử hội thoại',
      data: { cleared: true }
    });
  })
};
