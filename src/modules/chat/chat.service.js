import { executeJev } from './jevEngine.js';
import {
  estimateMinCost,
  searchRescueDeals,
  searchRecipes,
  generateMealSchedule
} from './chatTools.js';
import {
  buildContext,
  appendSessionTurn,
  extractAndSaveMemoryAsync
} from './memory.service.js';

function formatVND(n) {
  return (n || 0).toLocaleString('vi-VN') + 'đ';
}

/**
 * Main Chat Processing Pipeline
 * @param {Object} params - { message, userId, sessionId, stream }
 */
export async function processChatMessage({ message, userId, sessionId }) {
  const effectiveSessionId = sessionId || userId || 'anon_' + Date.now();

  // [1] Gateway: Record user message
  appendSessionTurn(effectiveSessionId, 'user', message);

  // [2] Context Builder (< 30ms)
  const context = await buildContext({ userId, sessionId: effectiveSessionId, currentMessage: message });

  // [3] JEV Pre-Router (Primitive: choice)
  const routerDecision = await executeJev('pre_router', { message });
  const intent = routerDecision.decision;

  console.log(`[Chat Pipeline] Intent: ${intent} (Confidence: ${routerDecision.confidence}) for session: ${effectiveSessionId}`);

  let replyText = '';
  let richCards = null;
  let quickSuggestions = [];

  // [4] Route to appropriate handler
  switch (intent) {
    case 'CHITCHAT': {
      replyText = handleChitchat(message, context);
      quickSuggestions = [
        'Ăn 50K/ngày đủ chất không?',
        'Kế hoạch chi tiêu 1.5 triệu/tháng',
        'Có suất ăn giải cứu nào dưới 30k gần đây không?'
      ];
      break;
    }

    case 'RESCUE_DEAL_SEARCH': {
      const deals = await searchRescueDeals({ maxPrice: 40000, limit: 3 });
      replyText = `Dưới đây là các suất ăn giải cứu cận date đang có giá tốt nhất từ các quán đối tác lân cận:\n\n`;
      if (deals.length === 0) {
        replyText += `Hiện chưa có món cận date nào dưới 40.000đ trong bán kính gần. Bạn có thể mở mục Bản đồ để xem thêm các khu vực khác nhé!`;
      } else {
        deals.forEach((d, idx) => {
          replyText += `${idx + 1}. **${d.title}**\n   - Giá giải cứu: **${formatVND(d.discountPrice)}** (Giá gốc: ~~${formatVND(d.originalPrice)}~~)\n   - Quán: *${d.partnerName}* · ${d.address}\n\n`;
        });
        replyText += `💡 Bạn có thể đặt giữ món ngay hoặc mở Bản đồ FoodSaver để kiểm tra khoảng cách và ghé lấy.`;
      }
      richCards = {
        type: 'deals_list',
        data: deals
      };
      quickSuggestions = [
        'Mở Radar bản đồ',
        'Lên thực đơn với các món này',
        'Xem thêm quán khác'
      ];
      break;
    }

    case 'MEAL_PLAN_BUDGET': {
      // Step A: Parse budget & days from message
      const parsed = parseBudgetAndDays(message);
      const days = parsed.days || 30;
      const budget = parsed.budget || 100000;
      const people = parsed.people || 1;

      // Step B: Tool estimate_min_cost
      const estimate = await estimateMinCost({ days, people, targetBudget: budget });

      // Step C: JEV Guard Feasibility Rubric
      const feasibility = await executeJev('feasibility', {
        days,
        targetBudget: budget,
        minEstimatedCost: estimate.breakdown.bareSurvivalPerDay * days,
        people
      });

      console.log(`[JEV Feasibility Guard] Result: ${feasibility.decision} (Score: ${feasibility.score})`);

      // Step D: Negotiate or Pass
      if (feasibility.decision === 'IMPOSSIBLE' || feasibility.decision === 'NEGOTIATE') {
        const realisticDays = Math.max(1, Math.floor(budget / (estimate.breakdown.bareSurvivalPerDay * people)));
        const recommendedMinTotal = estimate.breakdown.bareSurvivalPerDay * days * people;
        const balancedTotal = estimate.breakdown.balancedSavingPerDay * days * people;

        replyText = `**Phân tích tính khả thi từ FoodSaver AI & JEV Guard:**\n\n`;
        replyText += `Với mức ngân sách **${formatVND(budget)}** cho **${days} ngày** (${people} người), mức chi bình quân chỉ đạt **~${formatVND(Math.round(budget / days / people))}/ngày**.\n\n`;
        replyText += `⚠️ **Đánh giá khả thi (Điểm JEV: ${feasibility.score}/1.0):**\n`;
        replyText += `- Để nạp đủ năng lượng tối thiểu (1.500 - 1.800 kcal/ngày), chi phí nấu ăn tại gia cơ bản (gạo, trứng, rau xanh, đậu hũ) hiện tại cần tối thiểu **~${formatVND(estimate.breakdown.bareSurvivalPerDay)}/ngày**.\n`;
        replyText += `- Mức ngân sách hiện tại không đủ để duy trì sức khỏe trong suốt ${days} ngày nếu không có hỗ trợ khác.\n\n`;
        replyText += `💡 **FoodSaver đề xuất 3 phương án khả thi thực tế:**\n\n`;
        replyText += `1. **Rút ngắn số ngày theo ngân sách:** Dùng ${formatVND(budget)} để ăn uống đầy đủ dinh dưỡng trong **~${realisticDays} ngày** (~${formatVND(estimate.breakdown.bareSurvivalPerDay)}/ngày).\n`;
        replyText += `2. **Điều chỉnh ngân sách cho ${days} ngày:**\n   - Mức tối giản: **~${formatVND(recommendedMinTotal)}** (~${formatVND(estimate.breakdown.bareSurvivalPerDay)}/ngày).\n   - Mức cân đối có thịt cá: **~${formatVND(balancedTotal)}** (~${formatVND(estimate.breakdown.balancedSavingPerDay)}/ngày).\n`;
        replyText += `3. **Săn suất ăn giải cứu cận date:** Kết hợp mua các deal giờ vàng từ **10.000đ - 18.000đ** từ các đối tác FoodSaver gần bạn để vừa tiết kiệm vừa không tốn tiền gas/dầu ăn.`;

        richCards = {
          type: 'feasibility_negotiation',
          data: {
            requestedBudget: budget,
            days,
            people,
            score: feasibility.score,
            realisticDays,
            recommendedMinTotal,
            balancedTotal,
          }
        };
      } else {
        // High Feasibility (PASS): Generate Schedule
        const schedule = await generateMealSchedule({ days, budget, people });
        replyText = `**Kế hoạch thực đơn tối ưu (${days} ngày · Ngân sách ${formatVND(budget)}):**\n\n`;
        replyText += `Ngân sách bình quân mỗi ngày: **~${formatVND(schedule.dailyBudget)}/ngày**.\n\n`;

        schedule.schedule.slice(0, 3).forEach(s => {
          replyText += `📅 **Ngày ${s.day}:**\n`;
          replyText += `- 🌅 Sáng: ${s.slots.breakfast.name} (~${formatVND(s.slots.breakfast.cost)})\n`;
          replyText += `- ☀️ Trưa: ${s.slots.lunch.name} (~${formatVND(s.slots.lunch.cost)})\n`;
          replyText += `- 🌙 Tối: ${s.slots.dinner.name} (~${formatVND(s.slots.dinner.cost)})\n`;
          replyText += `  *Tổng ngày:* ${formatVND(s.dayTotalCost)}\n\n`;
        });

        replyText += `💡 Bạn có thể đồng bộ thực đơn này vào mục **Lịch ăn tháng** để theo dõi calo và lên đồ đi chợ thông minh.`;

        richCards = {
          type: 'schedule_preview',
          data: schedule
        };
      }

      quickSuggestions = [
        'Áp dụng kế hoạch 5 ngày với 100K',
        'Xem thực đơn 50K/ngày',
        'Tìm suất ăn cận date gần tôi'
      ];
      break;
    }

    default: {
      replyText = handleGeneralQA(message);
      quickSuggestions = [
        'Lập kế hoạch ăn uống',
        'Tìm chợ giá rẻ ở TP.HCM',
        'Cách bảo quản thực phẩm cận date'
      ];
      break;
    }
  }

  // [5] Question Engine: Append subtle personalized question if available
  if (context.suggestedQuestion && intent !== 'CHITCHAT' && Math.random() > 0.4) {
    replyText += `\n\n💬 *Gợi ý nhỏ: ${context.suggestedQuestion.ask_prompt}*`;
  }

  // [6] Record assistant turn
  appendSessionTurn(effectiveSessionId, 'assistant', replyText);

  // [7] Async Memory Extractor (non-blocking, runs in background)
  setImmediate(() => {
    extractAndSaveMemoryAsync({
      userId,
      sessionId: effectiveSessionId,
      message
    }).catch(err => console.warn('[Memory Extractor Async Error]:', err.message));
  });

  return {
    reply: replyText,
    intent,
    richCards,
    quickSuggestions,
    profileContext: context.profile
  };
}

/**
 * Parses user input for budget amounts and duration days
 */
function parseBudgetAndDays(text) {
  const norm = text.toLowerCase();
  let days = 30; // default assumption for "1 tháng"
  let budget = 0;
  let people = 1;

  // Days detection
  if (norm.includes('1 ngay') || norm.includes('mot ngay') || norm.includes('/ngay') || norm.includes('moi ngay')) {
    days = 1;
  } else if (norm.includes('1 tuan') || norm.includes('mot tuan') || norm.includes('7 ngay')) {
    days = 7;
  } else if (norm.includes('1 thang') || norm.includes('mot thang') || norm.includes('30 ngay')) {
    days = 30;
  } else {
    const daysMatch = norm.match(/(\d+)\s*(?:ngay|day)/);
    if (daysMatch) days = parseInt(daysMatch[1], 10);
  }

  // People detection
  const peopleMatch = norm.match(/(\d+)\s*(?:nguoi|ban)/);
  if (peopleMatch) people = parseInt(peopleMatch[1], 10);

  // Budget detection (e.g. 50k, 100k, 1.5tr, 1.5 trieu, 500.000)
  const kMatch = norm.match(/(\d+(?:\.\d+)?)\s*(?:k|nghin|ngan)/);
  const trMatch = norm.match(/(\d+(?:\.\d+)?)\s*(?:tr|trieu)/);
  const rawNumMatch = norm.match(/(\d{2,3}(?:\.\d{3})+)/);

  if (trMatch) {
    budget = parseFloat(trMatch[1]) * 1000000;
  } else if (kMatch) {
    budget = parseFloat(kMatch[1]) * 1000;
  } else if (rawNumMatch) {
    budget = parseInt(rawNumMatch[1].replace(/\./g, ''), 10);
  } else {
    // fallback look for simple numbers
    const numMatch = norm.match(/(\d{4,9})/);
    if (numMatch) budget = parseInt(numMatch[1], 10);
    else budget = 100000;
  }

  return { days, budget, people };
}

function handleChitchat(message, context) {
  const name = context.profile.address_form || 'bạn';
  return `Chào ${name}! Mình là Trợ lý Dinh dưỡng & Tài chính FoodSaver. Mình có thể giúp ${name} lập kế hoạch chi tiêu ăn uống tiết kiệm, gợi ý món ăn dinh dưỡng và tìm kiếm các suất ăn giải cứu giờ vàng lân cận. Hôm nay ${name} đang muốn lên kế hoạch ăn uống như thế nào?`;
}

function handleGeneralQA(message) {
  const norm = message.toLowerCase();
  if (norm.includes('cho') || norm.includes('mua do re')) {
    return `**Gợi ý các chợ giá tốt tại TP.HCM:**\n\n1. **Chợ đầu mối Hóc Môn (Tây Bắc):** Nổi tiếng về thịt heo sạch và rau củ quả giá sỉ từ 2h sáng.\n2. **Chợ đầu mối Nông sản Thủ Đức (Đông):** Vựa trái cây và rau củ lớn nhất, rẻ hơn chợ bán lẻ 30-40% khi mua theo cân/rổ.\n3. **Chợ Bình Điền (Quận 8):** Hải sản tươi sống, thịt cá đầu mối mở suốt đêm.\n4. **Chợ Bà Chiểu & Chợ Tân Định:** Thuận tiện trong nội thành, nhiều sạp rau quả bình dân sau 16h chiều.\n\n💡 *Mẹo:* Đi chợ cùng bạn bè để mua số lượng 2-3kg chia nhau giá sỉ!`;
  }

  if (norm.includes('bao quan') || norm.includes('can date')) {
    return `**Mẹo bảo quản thực phẩm tiết kiệm:**\n\n1. **Thịt cá cận date:** Mua về rửa sạch với nước muối loãng, thấm khô và cấp đông ngay vào các túi zip chia nhỏ từng bữa.\n2. **Rau củ:** Không rửa trước khi cất tủ lạnh; bọc trong giấy báo hoặc khăn giấy để hút ẩm thừa, giữ tươi được 5-7 ngày.\n3. **Cơm nguội / Bánh mì:** Cơm nguội cho vào hộp kín để ngăn mát nấu cơm rang; bánh mì bọc kín cấp đông, khi ăn xịt nhẹ chút nước rồi nướng lại giòn rụm.`;
  }

  return `Chào bạn! FoodSaver hỗ trợ bạn 3 việc chính:\n\n1. **Lập kế hoạch ăn uống theo ngân sách:** Tính toán số tiền mỗi bữa (50k/ngày, 1.5tr/tháng...) đảm bảo đủ calo.\n2. **Gợi ý công thức & Nguyên liệu:** Hướng dẫn cách nấu ngon và tiết kiệm.\n3. **Radar giải cứu cận date:** Kết nối bạn với các suất ăn giờ vàng từ nhà hàng, quán ăn đối tác với giá giảm đến 50%.`;
}
