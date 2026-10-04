import { processChatMessage } from './chat.service.js';
import { getUserFacts, deleteUserFact, clearSessionMemory } from './memory.service.js';
import { ApiResponse } from '../../shared/utils/apiResponse.js';
import { asyncHandler } from '../../shared/utils/asyncHandler.js';
import { ApiError } from '../../shared/utils/apiError.js';

export const chatController = {
  /**
   * Standard JSON completion
   */
  sendMessage: asyncHandler(async (req, res) => {
    const { message, sessionId } = req.body;
    const userId = req.user?.id || req.body.userId;

    if (!message || typeof message !== 'string' || !message.trim()) {
      throw ApiError.badRequest('Nội dung tin nhắn không được để trống');
    }

    const result = await processChatMessage({
      message: message.trim(),
      userId,
      sessionId
    });

    return ApiResponse.success(res, {
      message: 'Xử lý tin nhắn thành công',
      data: result
    });
  }),

  /**
   * Server-Sent Events (SSE) Streaming completion
   */
  streamMessage: asyncHandler(async (req, res) => {
    const { message, sessionId } = req.body;
    const userId = req.user?.id || req.body.userId;

    if (!message || typeof message !== 'string' || !message.trim()) {
      return res.status(400).json({ success: false, message: 'Nội dung tin nhắn không được để trống' });
    }

    // Set headers for SSE streaming
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();

    try {
      const result = await processChatMessage({
        message: message.trim(),
        userId,
        sessionId
      });

      // Stream words smoothly
      const words = result.reply.split(' ');
      for (let i = 0; i < words.length; i++) {
        const chunk = words[i] + (i === words.length - 1 ? '' : ' ');
        res.write(`data: ${JSON.stringify({ type: 'token', content: chunk })}\n\n`);
        await new Promise(r => setTimeout(r, 15));
      }

      // Stream rich cards and suggestions at the end
      res.write(`data: ${JSON.stringify({
        type: 'done',
        intent: result.intent,
        richCards: result.richCards,
        quickSuggestions: result.quickSuggestions,
        profileContext: result.profileContext
      })}\n\n`);

      res.end();
    } catch (err) {
      res.write(`data: ${JSON.stringify({ type: 'error', error: err.message })}\n\n`);
      res.end();
    }
  }),

  /**
   * Get user facts / transparency
   */
  getMemory: asyncHandler(async (req, res) => {
    const effectiveId = req.user?.id || req.query.sessionId || req.query.userId || 'anonymous';
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
    const effectiveId = req.user?.id || req.body.sessionId || 'anonymous';
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
    const effectiveId = req.user?.id || req.body.sessionId || 'anonymous';
    clearSessionMemory(effectiveId);
    return ApiResponse.success(res, {
      message: 'Đã xóa lịch sử hội thoại',
      data: { cleared: true }
    });
  })
};
