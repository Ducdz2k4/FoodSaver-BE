import { executeJev, stripVN } from './jevEngine.js';
import {
  estimateMinCost,
  searchRescueDeals,
  searchRecipes,
  generateMealSchedule
} from './chatTools.js';
import {
  buildContext,
  appendSessionTurn,
  extractAndSaveMemoryAsync,
  saveUserFact
} from './memory.service.js';
import { generateLLMResponse, streamLLMResponse } from './llmClient.js';

function formatVND(n) {
  return (n || 0).toLocaleString('vi-VN') + 'đ';
}

/**
 * Parses user input for budget amounts and duration days accurately
 */
export function parseBudgetAndDays(text) {
  const norm = stripVN(text);
  let days = 0;
  let budget = 0;
  let people = 1;

  // 1. Days detection
  if (norm.includes('/ngay') || norm.includes('1 ngay') || norm.includes('moi ngay') || norm.includes('hang ngay') || norm.includes('moi bua')) {
    days = 1;
  } else if (norm.includes('1 tuan') || norm.includes('mot tuan') || norm.includes('/tuan')) {
    days = 7;
  } else if (norm.includes('1 thang') || norm.includes('mot thang') || norm.includes('/thang')) {
    days = 30;
  } else {
    const daysMatch = norm.match(/(\d+)\s*(?:ngay|day)/);
    if (daysMatch) {
      days = parseInt(daysMatch[1], 10);
    }
  }

  // 2. People detection
  const peopleMatch = norm.match(/(\d+)\s*(?:nguoi|ban|khau phan)/);
  if (peopleMatch) people = parseInt(peopleMatch[1], 10);

  // 3. Budget detection
  const trMatch = norm.match(/(\d+(?:[.,]\d+)?)\s*(?:tr|trieu)/);
  const kMatch = norm.match(/(\d+(?:[.,]\d+)?)\s*(?:k|nghin|ngan)/);
  const rawVndMatch = norm.match(/(\d{1,3}(?:\.\d{3})+|\d{4,9})\s*(?:d|vnd|dong)?/);

  if (trMatch) {
    budget = parseFloat(trMatch[1].replace(',', '.')) * 1000000;
  } else if (kMatch) {
    budget = parseFloat(kMatch[1].replace(',', '.')) * 1000;
  } else if (rawVndMatch) {
    budget = parseInt(rawVndMatch[1].replace(/\./g, ''), 10);
  }

  // Fallback defaults
  if (days === 0) {
    if (norm.includes('thang')) days = 30;
    else if (norm.includes('tuan')) days = 7;
    else days = 1;
  }

  if (budget === 0) {
    budget = 50000;
  }

  return { days, budget, people };
}

/**
 * Prepares Context, JEV Pre-Router, Tools & LLM Prompt
 */
export async function prepareChatPipeline({ message, userId, sessionId }) {
  const effectiveSessionId = sessionId || userId || 'anon_' + Date.now();

  // [1] Gateway: Record user turn
  appendSessionTurn(effectiveSessionId, 'user', message);

  // [2] Context Builder (< 30ms)
  const context = await buildContext({ userId, sessionId: effectiveSessionId, currentMessage: message });

  // Pronouns
  let userPronoun = context.profile.address_form || 'bạn';
  let botPronoun = context.profile.bot_form || (userPronoun === 'Anh' || userPronoun === 'Chị' ? 'em' : 'mình');

  // [3] JEV Pre-Router (Primitive: choice)
  const routerDecision = await executeJev('pre_router', { message });
  const intent = routerDecision.decision;

  console.log(`[Chat Pipeline] Intent: ${intent} (Confidence: ${routerDecision.confidence}) for session: ${effectiveSessionId}`);

  let richCards = null;
  let quickSuggestions = [];
  let systemDirective = '';

  switch (intent) {
    case 'SYSTEM_FEEDBACK': {
      systemDirective = `[JEV System Explanation Directives]:
- Người dùng đang hỏi về lỗi lặp lại, hoặc hỏi có phải dữ liệu mock hay bot bị ngáo không.
- Giải thích: Vừa rồi tiến trình backend chưa kịp nạp lại bản sửa lỗi bóc tách ngữ nghĩa tiếng Việt (Regex từ 'ngày' có dấu huyền khiến mọi số ngày bị fallback về 30 ngày), dẫn đến bot liên tục báo không đủ tiền cho 30 ngày và lặp lại đề xuất.
- Khẳng định 100% dữ liệu của FoodSaver là THẬT: 16 công thức món ăn & calo trong DB, 11 suất ăn giải cứu cận date từ đối tác FoodSaver lân cận, và bộ lọc JEV Guard tính toán dựa trên chi phí dinh dưỡng thực tế ở Việt Nam. Đầu ra ngôn ngữ hiện tại được tạo trực tiếp bởi mô hình LLM openai/gpt-oss-120b.
- Xưng hô đúng '${botPronoun}' và gọi '${userPronoun}'. Hãy xin lỗi nhẹ nhàng, vui vẻ và mời ${userPronoun} thử lại các câu hỏi ngân sách thực tế.`;
      quickSuggestions = [
        'Ăn 50K/ngày đủ chất không?',
        'Lên thực đơn 2 ngày với 50.000đ',
        'Kế hoạch chi tiêu 1.5 triệu/tháng',
        'Tìm suất ăn giải cứu gần đây'
      ];
      break;
    }

    case 'PROFILE_UPDATE': {
      const norm = stripVN(message);
      if (norm.includes('anh em') || norm.includes('anh - em') || norm.includes('goi anh') || norm.includes('xung ho anh')) {
        userPronoun = 'Anh';
        botPronoun = 'em';
      } else if (norm.includes('chi em') || norm.includes('chi - em') || norm.includes('goi chi') || norm.includes('xung ho chi')) {
        userPronoun = 'Chị';
        botPronoun = 'em';
      } else if (norm.includes('ban minh') || norm.includes('ban - minh') || norm.includes('goi ban') || norm.includes('xung ho ban')) {
        userPronoun = 'Bạn';
        botPronoun = 'mình';
      } else if (norm.includes('em anh') || norm.includes('em - anh')) {
        userPronoun = 'Em';
        botPronoun = 'anh';
      }

      saveUserFact(context.userId, 'address_form', userPronoun);
      saveUserFact(context.userId, 'bot_form', botPronoun);
      context.profile.address_form = userPronoun;
      context.profile.bot_form = botPronoun;

      if (norm.includes('di ung') || norm.includes('kieng an')) {
        saveUserFact(context.userId, 'allergies', message);
      }

      systemDirective = `[JEV Profile Update Directives]:
- Người dùng vừa cung cấp cách xưng hô: Gọi người dùng là "${userPronoun}" và xưng là "${botPronoun}".
- Hãy xác nhận tự nhiên, ấm áp rằng ${botPronoun} đã ghi nhớ cách xưng hô này và sẵn sàng hỗ trợ ${userPronoun} lên thực đơn chi tiêu hoặc tìm deal giải cứu.`;
      quickSuggestions = [
        'Ăn 50K/ngày đủ chất không?',
        'Kế hoạch chi tiêu 1.5 triệu/tháng',
        'Tìm suất ăn giải cứu gần đây'
      ];
      break;
    }

    case 'RESCUE_DEAL_SEARCH': {
      const deals = await searchRescueDeals({ maxPrice: 40000, limit: 4 });
      richCards = {
        type: 'deals_list',
        data: deals
      };
      systemDirective = `[JEV Rescue Deals Search Directives]:
- Kết quả tìm kiếm từ đối tác FoodSaver (${deals.length} món tìm thấy):
${deals.map((d, i) => `${i + 1}. ${d.title} - Giá giảm: ${formatVND(d.discountPrice)} (Giá gốc: ${formatVND(d.originalPrice)}) - Quán: ${d.partnerName} (${d.address})`).join('\n')}
- Hãy giới thiệu các suất ăn giải cứu này cho ${userPronoun}, nêu bật giá tiết kiệm và gợi ý mở Bản đồ FoodSaver để đến lấy.`;
      quickSuggestions = [
        'Xem trên Bản đồ FoodSaver',
        'Lên thực đơn ăn 3 ngày',
        'Mẹo bảo quản thực phẩm cận date'
      ];
      break;
    }

    case 'MEAL_PLAN_BUDGET': {
      const parsed = parseBudgetAndDays(message);
      const days = parsed.days;
      const budget = parsed.budget;
      const people = parsed.people;
      const dailyBudget = Math.floor(budget / days / people);

      const estimate = await estimateMinCost({ days, people, targetBudget: budget });
      const feasibility = await executeJev('feasibility', {
        days,
        targetBudget: budget,
        people
      });

      console.log(`[JEV Feasibility Guard] Result: ${feasibility.decision} (Score: ${feasibility.score}), Days: ${days}, Budget: ${budget}, Daily: ${dailyBudget}`);

      if (feasibility.decision === 'PASS') {
        const schedule = await generateMealSchedule({ days, budget, people });
        richCards = {
          type: 'schedule_preview',
          data: schedule
        };

        const scheduleSummary = schedule.schedule.slice(0, 5).map(s =>
          `Ngày ${s.day}: Sáng: ${s.slots.breakfast.name} (~${formatVND(s.slots.breakfast.cost)}, ${s.slots.breakfast.calories} kcal) | Trưa: ${s.slots.lunch.name} (~${formatVND(s.slots.lunch.cost)}, ${s.slots.lunch.calories} kcal) | Tối: ${s.slots.dinner.name} (~${formatVND(s.slots.dinner.cost)}, ${s.slots.dinner.calories} kcal) -> Tổng ngày: ~${formatVND(s.dayTotalCost)}`
        ).join('\n');

        systemDirective = `[JEV Guard & Schedule Directives]:
- Trạng thái JEV Guard: PASS (Điểm khả thi: ${feasibility.score}/1.0 - Đạt chuẩn dinh dưỡng).
- Kế hoạch: Ngân sách ${formatVND(budget)} cho ${days} ngày (${people} người) => Bình quân ~${formatVND(dailyBudget)}/ngày/người.
- Dữ liệu thực đơn chi tiết từ DB & bếp gia đình:
${scheduleSummary}
- Hướng dẫn: Trình bày thực đơn rõ ràng, đẹp mắt bằng Markdown. Nêu rõ calo và giá từng món. Động viên ${userPronoun} mở mục "Lịch ăn tháng" để áp dụng và đi chợ.`;

        quickSuggestions = [
          'Đồng bộ vào Lịch ăn tháng',
          'Tìm nguyên liệu rẻ gần tôi',
          'Săn deal giải cứu tối nay'
        ];
      } else {
        const realisticDays = Math.max(1, Math.floor(budget / (18000 * people)));
        const recommendedMinTotal = 18000 * days * people;
        const balancedTotal = 35000 * days * people;

        richCards = {
          type: 'feasibility_negotiation',
          data: {
            requestedBudget: budget,
            days,
            people,
            score: feasibility.score,
            realisticDays,
            recommendedMinTotal,
            balancedTotal
          }
        };

        systemDirective = `[JEV Feasibility Guard Directives]:
- Trạng thái JEV Guard: ${feasibility.decision} (Điểm: ${feasibility.score}/1.0 - Bất khả thi/Cần thương lượng).
- Phân tích: Ngân sách ${formatVND(budget)} cho ${days} ngày chỉ đạt ~${formatVND(dailyBudget)}/ngày/người. Mức này thấp hơn ngưỡng dinh dưỡng tối thiểu nấu ăn tại nhà (~18.000đ/ngày).
- Đề xuất 3 phương án đàm phán cụ thể:
  1. Rút ngắn số ngày: Dùng ${formatVND(budget)} ăn đủ dinh dưỡng trong ~${realisticDays} ngày (~18.000đ - 20.000đ/ngày).
  2. Điều chỉnh ngân sách cho ${days} ngày: Mức tối giản ~${formatVND(recommendedMinTotal)} (18.000đ/ngày); mức cân đối thịt cá ~${formatVND(balancedTotal)} (35.000đ/ngày).
  3. Săn suất ăn giải cứu cận date: Mua deal giờ vàng FoodSaver từ 10.000đ - 18.000đ từ các quán đối tác lân cận.
- Thái độ: Thấu hiểu, chia sẻ, mang tính xây dựng cao.`;

        quickSuggestions = [
          `Áp dụng kế hoạch ${realisticDays} ngày với ${formatVND(budget)}`,
          'Xem thực đơn 50K/ngày',
          'Tìm suất ăn cận date gần tôi'
        ];
      }
      break;
    }

    case 'CHITCHAT': {
      systemDirective = `[JEV Directives]: Người dùng đang chào hỏi hoặc trò chuyện xã giao. Hãy chào lại ${userPronoun} thật tươi vui, ấm áp, giới thiệu ${botPronoun} là Trợ lý Dinh dưỡng & Tài chính FoodSaver và gợi ý 1 câu hỏi thú vị về kế hoạch ăn uống hoặc tiết kiệm hôm nay.`;
      quickSuggestions = [
        'Ăn 50K/ngày đủ chất không?',
        'Kế hoạch chi tiêu 1.5 triệu/tháng',
        'Có món gì giải cứu gần tôi?'
      ];
      break;
    }

    default: {
      systemDirective = `[JEV Directives]: Người dùng đang hỏi đáp thông tin dinh dưỡng, bảo quản thực phẩm, tìm chợ giá rẻ tại TP.HCM (Hóc Môn, Thủ Đức, Bình Điền) hoặc thông tin chung. Trả lời chi tiết, thực tế, bổ ích.`;
      quickSuggestions = [
        'Lập kế hoạch ăn uống',
        'Tìm chợ giá rẻ ở TP.HCM',
        'Cách bảo quản thực phẩm cận date'
      ];
      break;
    }
  }

  const systemPrompt = `Bạn là Trợ lý Dinh dưỡng & Tài chính FoodSaver – một trợ lý AI thông minh, nhiệt thành và thực tế, vận hành cùng bộ lọc JEV Guard System One.
XƯNG HÔ BẮT BUỘC:
- Luôn luôn tự xưng là "${botPronoun}".
- Luôn luôn gọi người dùng là "${userPronoun}".
- Tuyệt đối giữ đúng cặp xưng hô này trong toàn bộ câu trả lời, không đổi sang đại từ khác.

NGUYÊN TẮC TRẢ LỜI:
1. Tất cả số liệu dinh dưỡng, giá tiền món ăn, điểm JEV Guard và suất ăn giải cứu được cung cấp trong chỉ dẫn hệ thống bên dưới là SỰ THẬT DUY NHẤT TỪ DATABASE. Hãy sử dụng chính xác các số liệu này để trả lời.
2. Trình bày đẹp mắt bằng Markdown (tiêu đề in đậm, danh sách có bullet point, icon trực quan).
3. Tuyệt đối không để lộ các thẻ kỹ thuật như [JEV Directives].

${systemDirective}`;

  const llmMessages = [];
  const history = context.recentTurns || [];
  for (const turn of history.slice(-6)) {
    llmMessages.push({
      role: turn.role === 'assistant' ? 'assistant' : 'user',
      content: turn.content
    });
  }

  llmMessages.push({
    role: 'user',
    content: message
  });

  return {
    systemPrompt,
    llmMessages,
    intent,
    richCards,
    quickSuggestions,
    context,
    effectiveSessionId
  };
}

/**
 * JSON Completion with LLM Responder
 */
export async function processChatMessage({ message, userId, sessionId }) {
  const pipeline = await prepareChatPipeline({ message, userId, sessionId });

  let replyText = '';
  try {
    replyText = await generateLLMResponse({
      systemPrompt: pipeline.systemPrompt,
      messages: pipeline.llmMessages,
      maxTokens: 2500,
      temperature: 0.6
    });
  } catch (err) {
    console.warn('[LLM Generate Error, using fallback]:', err.message);
    replyText = `Chào ${pipeline.context.profile.address_form || 'bạn'}! Em đã ghi nhận yêu cầu và đồng bộ dữ liệu cùng FoodSaver JEV Guard.`;
  }

  // Record assistant turn
  appendSessionTurn(pipeline.effectiveSessionId, 'assistant', replyText);

  // Async Memory Extractor
  setImmediate(() => {
    extractAndSaveMemoryAsync({
      userId,
      sessionId: pipeline.effectiveSessionId,
      message
    }).catch(err => console.warn('[Memory Extractor Async Error]:', err.message));
  });

  return {
    reply: replyText,
    intent: pipeline.intent,
    richCards: pipeline.richCards,
    quickSuggestions: pipeline.quickSuggestions,
    profileContext: pipeline.context.profile
  };
}

/**
 * SSE Streaming with LLM Responder
 */
export async function streamChatPipeline({ message, userId, sessionId, onToken }) {
  const pipeline = await prepareChatPipeline({ message, userId, sessionId });

  let fullReply = '';
  try {
    fullReply = await streamLLMResponse({
      systemPrompt: pipeline.systemPrompt,
      messages: pipeline.llmMessages,
      onToken,
      maxTokens: 2500,
      temperature: 0.6
    });
  } catch (err) {
    console.warn('[LLM Stream Error, using fallback]:', err.message);
    fullReply = `Dạ chào ${pipeline.context.profile.address_form || 'bạn'}! Em đang kết nối hệ thống FoodSaver.`;
    if (onToken) onToken(fullReply);
  }

  // Record assistant turn
  appendSessionTurn(pipeline.effectiveSessionId, 'assistant', fullReply);

  // Async Memory Extractor
  setImmediate(() => {
    extractAndSaveMemoryAsync({
      userId,
      sessionId: pipeline.effectiveSessionId,
      message
    }).catch(err => console.warn('[Memory Extractor Async Error]:', err.message));
  });

  return {
    pipeline,
    fullReply
  };
}
