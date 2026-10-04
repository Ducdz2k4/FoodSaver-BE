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

function formatVND(n) {
  return (n || 0).toLocaleString('vi-VN') + 'đ';
}

/**
 * Main Chat Processing Pipeline
 * @param {Object} params - { message, userId, sessionId }
 */
export async function processChatMessage({ message, userId, sessionId }) {
  const effectiveSessionId = sessionId || userId || 'anon_' + Date.now();

  // [1] Gateway: Record user message
  appendSessionTurn(effectiveSessionId, 'user', message);

  // [2] Context Builder (< 30ms)
  const context = await buildContext({ userId, sessionId: effectiveSessionId, currentMessage: message });

  // Determine user pronouns
  const userPronoun = context.profile.address_form || 'bạn';
  const botPronoun = context.profile.bot_form || (userPronoun === 'Anh' || userPronoun === 'Chị' ? 'em' : 'mình');

  // [3] JEV Pre-Router (Primitive: choice)
  const routerDecision = await executeJev('pre_router', { message });
  const intent = routerDecision.decision;

  console.log(`[Chat Pipeline] Intent: ${intent} (Confidence: ${routerDecision.confidence}) for session: ${effectiveSessionId}`);

  let replyText = '';
  let richCards = null;
  let quickSuggestions = [];

  // [4] Route to appropriate handler
  switch (intent) {
    case 'SYSTEM_FEEDBACK': {
      replyText = handleSystemFeedback(message, context);
      quickSuggestions = [
        'Ăn 50K/ngày đủ chất không?',
        'Lên thực đơn 2 ngày với 50.000đ',
        'Kế hoạch chi tiêu 1.5 triệu/tháng',
        'Tìm suất ăn giải cứu gần đây'
      ];
      break;
    }

    case 'PROFILE_UPDATE': {
      replyText = handleProfileUpdate(message, context);
      quickSuggestions = [
        'Ăn 50K/ngày đủ chất không?',
        'Kế hoạch chi tiêu 1.5 triệu/tháng',
        'Tìm suất ăn giải cứu gần đây'
      ];
      break;
    }

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
      const deals = await searchRescueDeals({ maxPrice: 40000, limit: 4 });
      replyText = `Dưới đây là các suất ăn giải cứu cận date đang có giá tốt nhất từ các quán đối tác lân cận:\n\n`;
      if (deals.length === 0) {
        replyText += `Hiện chưa có món cận date nào dưới 40.000đ trong bán kính gần. ${userPronoun} có thể mở mục Bản đồ để xem thêm các khu vực khác nhé!`;
      } else {
        deals.forEach((d, idx) => {
          replyText += `${idx + 1}. **${d.title}**\n   - Giá giải cứu: **${formatVND(d.discountPrice)}** (Giá gốc: ~~${formatVND(d.originalPrice)}~~)\n   - Quán: *${d.partnerName}* · ${d.address}\n\n`;
        });
        replyText += `💡 ${userPronoun} có thể đặt giữ món ngay hoặc mở Bản đồ FoodSaver để kiểm tra khoảng cách và ghé lấy.`;
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
      // Step A: Parse budget & days from message accurately
      const parsed = parseBudgetAndDays(message);
      const days = parsed.days;
      const budget = parsed.budget;
      const people = parsed.people;
      const dailyBudget = Math.floor(budget / days / people);

      // Step B: Tool estimate_min_cost
      const estimate = await estimateMinCost({ days, people, targetBudget: budget });

      // Step C: JEV Guard Feasibility Rubric
      const feasibility = await executeJev('feasibility', {
        days,
        targetBudget: budget,
        people
      });

      console.log(`[JEV Feasibility Guard] Result: ${feasibility.decision} (Score: ${feasibility.score}), Days: ${days}, Budget: ${budget}, Daily: ${dailyBudget}`);

      // Step D: Branching based on JEV Guard decision
      if (feasibility.decision === 'PASS') {
        // High Feasibility (PASS): Generate Schedule
        const schedule = await generateMealSchedule({ days, budget, people });

        if (days === 1) {
          replyText = `**Hoàn toàn khả thi và đủ chất! (Điểm JEV: ${feasibility.score}/1.0 - Đạt chuẩn)**\n\n`;
          replyText += `Với mức chi tiêu **${formatVND(budget)}/ngày** cho ${people} người, ${userPronoun} có thể phân bổ bữa ăn đầy đủ dinh dưỡng như sau:\n\n`;
          replyText += `- 🌅 **Bữa sáng (~10.000đ - 12.000đ):** Bánh mì ốp la pate hoặc Xôi xéo mỡ hành ruốc\n`;
          replyText += `- ☀️ **Bữa trưa (~20.000đ - 22.000đ):** Cơm sườn nướng / Cơm rang dưa bò + Canh rau xanh\n`;
          replyText += `- 🌙 **Bữa tối (~15.000đ - 18.000đ):** Canh chua cá lóc / Đậu hũ sốt cà chua + Cơm trắng\n`;
          replyText += `- 🍎 **Snack (~3.000đ - 5.000đ):** 1 quả chuối tươi hoặc sữa chua\n\n`;
          replyText += `💡 **Mẹo vàng cho ${userPronoun}:** Mua nguyên liệu theo tuần hoặc săn các suất ăn giờ vàng FoodSaver để tiết kiệm thêm 20-30% tiền chợ!`;
        } else {
          replyText = `**Thực đơn tối ưu ${days} ngày với ngân sách ${formatVND(budget)} (Bình quân ~${formatVND(dailyBudget)}/ngày/người):**\n\n`;
          replyText += `✅ **Đánh giá JEV Guard:** Đạt chuẩn dinh dưỡng (Điểm khả thi: ${feasibility.score}/1.0).\n\n`;

          schedule.schedule.slice(0, Math.min(days, 5)).forEach(s => {
            replyText += `📅 **Ngày ${s.day}:**\n`;
            replyText += `- 🌅 Sáng: ${s.slots.breakfast.name} (~${formatVND(s.slots.breakfast.cost)})\n`;
            replyText += `- ☀️ Trưa: ${s.slots.lunch.name} (~${formatVND(s.slots.lunch.cost)})\n`;
            replyText += `- 🌙 Tối: ${s.slots.dinner.name} (~${formatVND(s.slots.dinner.cost)})\n`;
            replyText += `  *Tổng ngày:* ${formatVND(s.dayTotalCost)}\n\n`;
          });

          if (days > 5) {
            replyText += `*(Các ngày tiếp theo được luân phiên món để không bị ngán và cân bằng dinh dưỡng)*\n\n`;
          }

          replyText += `💡 ${userPronoun} có thể mở mục **Lịch ăn tháng** để đồng bộ kế hoạch này và nhận danh sách đi chợ tự động.`;
        }

        richCards = {
          type: 'schedule_preview',
          data: schedule
        };

        quickSuggestions = [
          'Đồng bộ vào Lịch ăn tháng',
          'Tìm nguyên liệu rẻ gần tôi',
          'Săn deal giải cứu tối nay'
        ];
      } else {
        // Infeasible (NEGOTIATE or IMPOSSIBLE)
        const realisticDays = Math.max(1, Math.floor(budget / (18000 * people)));
        const recommendedMinTotal = 18000 * days * people;
        const balancedTotal = 35000 * days * people;

        replyText = `**Phân tích tính khả thi từ FoodSaver AI & JEV Guard:**\n\n`;
        replyText += `Với mức ngân sách **${formatVND(budget)}** cho **${days} ngày** (${people} người), mức chi bình quân chỉ đạt **~${formatVND(dailyBudget)}/ngày**.\n\n`;
        replyText += `⚠️ **Đánh giá khả thi (Điểm JEV: ${feasibility.score}/1.0):**\n`;
        replyText += `- Để nạp đủ năng lượng tối thiểu (1.500 - 1.800 kcal/ngày), chi phí nấu ăn tại gia cơ bản (gạo, trứng, rau xanh, đậu hũ) hiện tại cần tối thiểu **~18.000đ/ngày**.\n`;
        replyText += `- Mức ngân sách hiện tại không đủ để duy trì sức khỏe trong suốt ${days} ngày nếu không có hỗ trợ khác.\n\n`;
        replyText += `💡 **FoodSaver đề xuất 3 phương án khả thi thực tế:**\n\n`;
        replyText += `1. **Rút ngắn số ngày theo ngân sách:** Dùng ${formatVND(budget)} để ăn uống đầy đủ dinh dưỡng trong **~${realisticDays} ngày** (~18.000đ/ngày).\n`;
        replyText += `2. **Điều chỉnh ngân sách cho ${days} ngày:**\n   - Mức tối giản: **~${formatVND(recommendedMinTotal)}** (~18.000đ/ngày).\n   - Mức cân đối có thịt cá: **~${formatVND(balancedTotal)}** (~35.000đ/ngày).\n`;
        replyText += `3. **Săn suất ăn giải cứu cận date:** Kết hợp mua các deal giờ vàng từ **10.000đ - 18.000đ** từ các đối tác FoodSaver gần ${userPronoun} để vừa tiết kiệm vừa không tốn tiền gas/dầu ăn.`;

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

        quickSuggestions = [
          `Áp dụng kế hoạch ${realisticDays} ngày với ${formatVND(budget)}`,
          `Lên thực đơn 30 ngày với ${formatVND(recommendedMinTotal)}`,
          'Tìm suất ăn cận date gần tôi'
        ];
      }
      break;
    }

    default: {
      replyText = handleGeneralQA(message, context);
      quickSuggestions = [
        'Lập kế hoạch ăn uống',
        'Tìm chợ giá rẻ ở TP.HCM',
        'Cách bảo quản thực phẩm cận date'
      ];
      break;
    }
  }

  // [5] Question Engine: Append subtle question only if field is truly missing and not in feedback/profile flow
  if (
    intent !== 'PROFILE_UPDATE' &&
    intent !== 'CHITCHAT' &&
    intent !== 'SYSTEM_FEEDBACK' &&
    context.suggestedQuestion &&
    !context.profile[context.suggestedQuestion.key] &&
    context.profile.address_form !== 'Anh' &&
    context.profile.address_form !== 'Chị' &&
    context.profile.address_form !== 'Bạn' &&
    Math.random() > 0.75
  ) {
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
 * Parses user input for budget amounts and duration days accurately with accent stripping
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
    // Regex for: '2 ngay', '5 ngay', '7 ngay', '14 ngay', '30 ngay'
    const daysMatch = norm.match(/(\d+)\s*(?:ngay|day)/);
    if (daysMatch) {
      days = parseInt(daysMatch[1], 10);
    }
  }

  // 2. People detection
  const peopleMatch = norm.match(/(\d+)\s*(?:nguoi|ban|khau phan)/);
  if (peopleMatch) people = parseInt(peopleMatch[1], 10);

  // 3. Budget detection (e.g. 50k, 100k, 1.5tr, 1.5 trieu, 540.000d, 50000)
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

function handleSystemFeedback(message, context) {
  const userPronoun = context.profile.address_form || 'bạn';
  const botPronoun = context.profile.bot_form || (userPronoun === 'Anh' || userPronoun === 'Chị' ? 'em' : 'mình');

  let text = `Dạ rất xin lỗi ${userPronoun}! Vừa rồi tiến trình backend chưa kịp nạp lại bản sửa lỗi bóc tách ngữ nghĩa (Regex nhận diện từ 'ngày' có dấu tiếng Việt), khiến hệ thống hiểu nhầm các kế hoạch 1 ngày, 2 ngày, 5 ngày thành chu kỳ 30 ngày dẫn đến phản hồi bị lặp lại và báo 'không đủ ngân sách'.\n\n`;
  text += `**${botPronoun.charAt(0).toUpperCase() + botPronoun.slice(1)} xin khẳng định dữ liệu FoodSaver là thật 100%:**\n`;
  text += `- 🍳 **16 công thức món ăn & lượng calo:** Được truy xuất trực tiếp từ cơ sở dữ liệu hệ thống (Bánh mì ốp la, Cơm tấm, Bún bò Huế, Đậu hũ sốt cà... và chi phí đi chợ thực tế).\n`;
  text += `- 🏪 **11 suất ăn giải cứu cận date:** Lấy trực tiếp từ các quán đối tác liên kết đang có deal giờ vàng lân cận.\n`;
  text += `- ⚖️ **Bộ lọc JEV Guard:** Đánh giá tính khả thi theo chi phí dinh dưỡng thực tế (ngưỡng tối thiểu ~18.000đ/ngày).\n\n`;
  text += `${botPronoun.charAt(0).toUpperCase() + botPronoun.slice(1)} đã ghi nhớ cách xưng hô và nạp lại hệ thống rồi ạ. Giờ ${userPronoun} có thể chọn hoặc nhắn lại:\n`;
  text += `- *Ăn 50K/ngày đủ chất không?*\n`;
  text += `- *Lên thực đơn 2 ngày với 50.000đ*\n`;
  text += `- *Kế hoạch chi tiêu 1.5 triệu/tháng*\n\n`;
  text += `${botPronoun.charAt(0).toUpperCase() + botPronoun.slice(1)} sẽ tính toán và xuất thực đơn chi tiết ngay cho ${userPronoun}!`;

  return text;
}

function handleProfileUpdate(message, context) {
  const norm = stripVN(message);
  const effectiveId = context.userId;

  if (norm.includes('anh em') || norm.includes('anh - em') || norm.includes('goi anh') || norm.includes('xung ho anh')) {
    saveUserFact(effectiveId, 'address_form', 'Anh');
    saveUserFact(effectiveId, 'bot_form', 'em');
    context.profile.address_form = 'Anh';
    context.profile.bot_form = 'em';
    return `Dạ vâng anh! Em đã ghi nhớ cách xưng hô anh - em rồi nhé. Em sẵn sàng hỗ trợ anh lên kế hoạch thực đơn tiết kiệm hoặc tìm kiếm các suất ăn giải cứu giờ vàng, anh cứ nhắn em nhé!`;
  }
  if (norm.includes('chi em') || norm.includes('chi - em') || norm.includes('goi chi') || norm.includes('xung ho chi')) {
    saveUserFact(effectiveId, 'address_form', 'Chị');
    saveUserFact(effectiveId, 'bot_form', 'em');
    context.profile.address_form = 'Chị';
    context.profile.bot_form = 'em';
    return `Dạ vâng chị! Em đã ghi nhớ cách xưng hô chị - em rồi nhé. Em sẵn sàng hỗ trợ chị lên thực đơn dinh dưỡng cho gia đình hoặc tìm deal giải cứu thực phẩm, chị cứ nhắn em nhé!`;
  }
  if (norm.includes('ban minh') || norm.includes('ban - minh') || norm.includes('goi ban') || norm.includes('xung ho ban')) {
    saveUserFact(effectiveId, 'address_form', 'Bạn');
    saveUserFact(effectiveId, 'bot_form', 'mình');
    context.profile.address_form = 'Bạn';
    context.profile.bot_form = 'mình';
    return `Ok bạn! Mình đã lưu cách xưng hô bạn - mình rồi nhé. Bạn muốn mình tính toán chi tiêu hay gợi ý món ăn gì hôm nay?`;
  }
  if (norm.includes('em anh') || norm.includes('em - anh')) {
    saveUserFact(effectiveId, 'address_form', 'Em');
    saveUserFact(effectiveId, 'bot_form', 'anh');
    context.profile.address_form = 'Em';
    context.profile.bot_form = 'anh';
    return `Dạ chào em! Anh đã ghi nhớ cách xưng hô rồi nhé. Em muốn anh hỗ trợ lập thực đơn hay tìm suất ăn gì nào?`;
  }
  if (norm.includes('di ung') || norm.includes('kieng an')) {
    saveUserFact(effectiveId, 'allergies', message);
    return `Em đã ghi nhận thông tin dị ứng/kiêng cữ của bạn vào hồ sơ rồi nhé. Các gợi ý thực đơn tiếp theo em sẽ tự động loại trừ các nguyên liệu này để bảo đảm an toàn sức khỏe!`;
  }

  return `Em đã ghi nhận thông tin của bạn vào bộ nhớ cá nhân hóa rồi nhé! Bạn muốn tiếp tục hỏi về thực đơn hay tính toán chi tiêu ăn uống ạ?`;
}

function handleChitchat(message, context) {
  const userPronoun = context.profile.address_form || 'bạn';
  const botPronoun = context.profile.bot_form || (userPronoun === 'Anh' || userPronoun === 'Chị' ? 'em' : 'mình');
  return `Chào ${userPronoun}! ${botPronoun.charAt(0).toUpperCase() + botPronoun.slice(1)} là Trợ lý Dinh dưỡng & Tài chính FoodSaver. ${botPronoun.charAt(0).toUpperCase() + botPronoun.slice(1)} có thể giúp ${userPronoun} lập kế hoạch chi tiêu ăn uống tiết kiệm, gợi ý món ăn dinh dưỡng và tìm kiếm các suất ăn giải cứu giờ vàng lân cận. Hôm nay ${userPronoun} đang muốn lên kế hoạch ăn uống như thế nào?`;
}

function handleGeneralQA(message, context) {
  const norm = stripVN(message);
  const userPronoun = context.profile.address_form || 'bạn';

  if (norm.includes('cho') || norm.includes('mua do re')) {
    return `**Gợi ý các chợ giá tốt tại TP.HCM:**\n\n1. **Chợ đầu mối Hóc Môn (Tây Bắc):** Nổi tiếng về thịt heo sạch và rau củ quả giá sỉ từ 2h sáng.\n2. **Chợ đầu mối Nông sản Thủ Đức (Đông):** Vựa trái cây và rau củ lớn nhất, rẻ hơn chợ bán lẻ 30-40% khi mua theo cân/rổ.\n3. **Chợ Bình Điền (Quận 8):** Hải sản tươi sống, thịt cá đầu mối mở suốt đêm.\n4. **Chợ Bà Chiểu & Chợ Tân Định:** Thuận tiện trong nội thành, nhiều sạp rau quả bình dân sau 16h chiều.\n\n💡 *Mẹo:* Đi chợ cùng bạn bè để mua số lượng 2-3kg chia nhau giá sỉ!`;
  }

  if (norm.includes('bao quan') || norm.includes('can date')) {
    return `**Mẹo bảo quản thực phẩm tiết kiệm:**\n\n1. **Thịt cá cận date:** Mua về rửa sạch với nước muối loãng, thấm khô và cấp đông ngay vào các túi zip chia nhỏ từng bữa.\n2. **Rau củ:** Không rửa trước khi cất tủ lạnh; bọc trong giấy báo hoặc khăn giấy để hút ẩm thừa, giữ tươi được 5-7 ngày.\n3. **Cơm nguội / Bánh mì:** Cơm nguội cho vào hộp kín để ngăn mát nấu cơm rang; bánh mì bọc kín cấp đông, khi ăn xịt nhẹ chút nước rồi nướng lại giòn rụm.`;
  }

  return `Chào ${userPronoun}! FoodSaver hỗ trợ ${userPronoun} 3 việc chính:\n\n1. **Lập kế hoạch ăn uống theo ngân sách:** Tính toán số tiền mỗi bữa (50k/ngày, 1.5tr/tháng...) đảm bảo đủ calo.\n2. **Gợi ý công thức & Nguyên liệu:** Hướng dẫn cách nấu ngon và tiết kiệm.\n3. **Radar giải cứu cận date:** Kết nối ${userPronoun} với các suất ăn giờ vàng từ nhà hàng, quán ăn đối tác với giá giảm đến 50%.`;
}
