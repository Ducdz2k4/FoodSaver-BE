import { executeJev, stripVN } from './jevEngine.js';
import {
  estimateMinCost,
  searchRescueDeals,
  searchRecipes,
  generateMealSchedule,
  readUserCalendar,
  writeUserCalendar
} from './chatTools.js';
import {
  buildContext,
  appendSessionTurn,
  extractAndSaveMemoryAsync,
  saveUserFact,
  setSessionState,
  getSessionState
} from './memory.service.js';
import { generateLLMResponse, streamLLMResponse } from './llmClient.js';

function formatVND(n) {
  return (n || 0).toLocaleString('vi-VN') + 'đ';
}

function formatDateVN(dateStr) {
  if (!dateStr) return '';
  const parts = dateStr.split('-');
  if (parts.length === 3) {
    return `${parts[2]}/${parts[1]}/${parts[0]}`;
  }
  return dateStr;
}

export function resolveDateFromText(text) {
  const norm = stripVN(text);
  const now = new Date('2026-10-04T12:00:00Z');

  if (norm.includes('ngay mai') || norm.includes('ngay tiep theo') || norm.includes('mai')) {
    const d = new Date(now);
    d.setDate(d.getDate() + 1);
    return d.toISOString().slice(0, 10);
  }
  if (norm.includes('ngay kia') || norm.includes('ngay mot')) {
    const d = new Date(now);
    d.setDate(d.getDate() + 2);
    return d.toISOString().slice(0, 10);
  }
  if (norm.includes('hom nay') || norm.includes('nay')) {
    return now.toISOString().slice(0, 10);
  }
  const match = norm.match(/(\d{1,2})[\/\-](\d{1,2})/);
  if (match) {
    const day = match[1].padStart(2, '0');
    const month = match[2].padStart(2, '0');
    return `2026-${month}-${day}`;
  }
  const d = new Date(now);
  d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
}

/**
 * Parses user input for budget amounts and duration days accurately
 */
export function parseBudgetAndDays(text) {
  const norm = stripVN(text);
  let days = 0;
  let budget = 0;
  let people = 1;

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

  const peopleMatch = norm.match(/(\d+)\s*(?:nguoi|ban|khau phan)/);
  if (peopleMatch) people = parseInt(peopleMatch[1], 10);

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

  appendSessionTurn(effectiveSessionId, 'user', message);

  const context = await buildContext({ userId, sessionId: effectiveSessionId, currentMessage: message });

  let userPronoun = context.profile.address_form || 'bạn';
  let botPronoun = context.profile.bot_form || (userPronoun === 'Anh' || userPronoun === 'Chị' ? 'em' : 'mình');

  const norm = stripVN(message);
  let richCards = null;
  let quickSuggestions = [];
  let systemDirective = '';

  // [3] JEV Pre-Router: Intent Classification
  const routerDecision = await executeJev('pre_router', { message });
  let intent = routerDecision.decision;

  // ══════════════════════════════════════════════════════════════
  // FLOW 1: CALENDAR ACTIONS (Read, Conflict Check, Write to DB)
  // ══════════════════════════════════════════════════════════════
  const hasProposedMenu = Boolean(getSessionState(effectiveSessionId, 'proposedMenu'));
  const isAffirmative =
    norm === 'co' ||
    norm === 'co nha' ||
    norm === 'co nhe' ||
    norm === 'co chu' ||
    norm === 'ok' ||
    norm === 'oke' ||
    norm === 'dong y' ||
    norm === 'duoc' ||
    norm === 'duoc nha' ||
    norm === 'luu di' ||
    norm === 'luu vao' ||
    norm === 'luu lai' ||
    norm === 'ap dung' ||
    norm === 'ap dung ngay' ||
    norm === 'yes';

  const isDecline =
    norm === 'khong' ||
    norm === 'khong nha' ||
    norm === 'khong nhe' ||
    norm === 'thoi' ||
    norm === 'doi mon' ||
    norm === 'khong can';

  const isCalendarAction =
    (hasProposedMenu && isAffirmative) ||
    norm.includes('ap dung vao lich') ||
    norm.includes('ap dung lich') ||
    norm.includes('thay the vao lich') ||
    norm.includes('luu vao lich') ||
    norm.includes('ghi vao lich') ||
    norm.includes('thay the toan bo') ||
    norm.includes('thay toan bo') ||
    norm.includes('chi thay the') ||
    norm.includes('chi doi') ||
    norm.includes('chi them') ||
    norm.includes('giu nguyen lich');

  if (isCalendarAction) {
    intent = 'WRITE_CALENDAR';
    const targetDate = resolveDateFromText(message) || getSessionState(effectiveSessionId, 'targetDate') || '2026-10-05';
    setSessionState(effectiveSessionId, 'targetDate', targetDate);

    // Read user calendar from Database
    const calData = await readUserCalendar({ date: targetDate, userId });

    const isConfirmedAll = norm.includes('thay the toan bo') || norm.includes('thay toan bo') || norm.includes('dong y thay') || norm.includes('thay het');
    const isOnlyLunch = norm.includes('bua trua') || norm.includes('trua');
    const isOnlyDinner = norm.includes('bua toi') || norm.includes('toi');
    const isOnlyBreakfast = norm.includes('bua sang') || norm.includes('sang');
    const isKeepOld = norm.includes('giu nguyen') || norm.includes('khong thay doi');

    if (isKeepOld) {
      systemDirective = `[JEV Calendar Action Directives]:
- Người dùng chọn giữ nguyên lịch ăn cũ ngày ${formatDateVN(targetDate)}.
- Hãy xác nhận lịch ăn cũ được giữ nguyên, thể hiện sự vui vẻ và sẵn sàng hỗ trợ các câu hỏi khác.`;
      quickSuggestions = [
        'Lên thực đơn ngày kia (06/10)',
        'Tìm quán giải cứu gần tôi',
        'Kiểm tra chi tiêu tuần này'
      ];
    } else if (calData.hasExisting && !isConfirmedAll && !isOnlyLunch && !isOnlyDinner && !isOnlyBreakfast) {
      // Conflict Detected! Prompt user for selective replacement
      const existingList = [
        calData.existingSlots.breakfast ? `- 🌅 Bữa sáng: **${calData.existingSlots.breakfast.meal}** (~${formatVND(calData.existingSlots.breakfast.cost)})` : null,
        calData.existingSlots.lunch ? `- ☀️ Bữa trưa: **${calData.existingSlots.lunch.meal}** (~${formatVND(calData.existingSlots.lunch.cost)})` : null,
        calData.existingSlots.dinner ? `- 🌙 Bữa tối: **${calData.existingSlots.dinner.meal}** (~${formatVND(calData.existingSlots.dinner.cost)})` : '- 🌙 Bữa tối: *Chưa lên lịch*',
        calData.existingSlots.snack ? `- 🍎 Bữa phụ: **${calData.existingSlots.snack.meal}** (~${formatVND(calData.existingSlots.snack.cost)})` : null
      ].filter(Boolean).join('\n');

      systemDirective = `[JEV Calendar Conflict Directives]:
- Trạng thái: Trong cơ sở dữ liệu hệ thống, ngày ${formatDateVN(targetDate)} đã có sẵn các món sau:
${existingList}
- Hãy thông báo chi tiết danh sách món đã có cho ${userPronoun}.
- Hỏi ${userPronoun} có muốn thay thế các món này bằng thực đơn mới không, và hỏi ${userPronoun} muốn thay thế toàn bộ hay chỉ đổi một bữa cụ thể (sáng / trưa / tối)?
- Trình bày lịch sự, thân thiện, rõ ràng.`;

      richCards = {
        type: 'calendar_conflict',
        data: {
          date: targetDate,
          formattedDate: formatDateVN(targetDate),
          existing: calData.existingSlots
        }
      };

      quickSuggestions = [
        'Thay thế toàn bộ ngày mai',
        'Chỉ thay thế Bữa trưa',
        'Chỉ thay thế Bữa tối',
        'Chỉ thay thế Bữa sáng',
        'Giữ nguyên lịch cũ'
      ];
    } else {
      // Confirmed or No conflict: Execute DB Write!
      let proposedMenu = getSessionState(effectiveSessionId, 'proposedMenu');
      if (!proposedMenu || !proposedMenu.lunch) {
        // Fallback default authentic Vietnamese vegetarian menu if not cached
        proposedMenu = {
          breakfast: { slot: 'breakfast', meal: 'Bánh mì chả lụa chay & dưa leo', cost: 10000, calories: 310, ingredients: ['Bánh mì', 'Chả lụa chay', 'Dưa leo'] },
          lunch: { slot: 'lunch', meal: 'Đậu hũ sốt cà chua hành hoa + Cơm trắng', cost: 15000, calories: 460, ingredients: ['Đậu hũ', 'Cà chua', 'Cơm trắng', 'Hành'] },
          dinner: { slot: 'dinner', meal: 'Nấm rơm kho sả ớt + Canh rau ngót', cost: 14000, calories: 390, ingredients: ['Nấm rơm', 'Sả ớt', 'Rau ngót', 'Cơm trắng'] }
        };
      }

      const getFallbackDishImage = (name = '') => {
        const lower = name.toLowerCase();
        if (lower.includes('bánh mì')) return 'https://images.unsplash.com/photo-1509722747041-616f39b57569?w=800';
        if (lower.includes('phở')) return 'https://images.unsplash.com/photo-1582878826629-29b7ad1cdc43?w=800';
        if (lower.includes('bún')) return 'https://images.unsplash.com/photo-1569718212165-3a8278d5f624?w=800';
        if (lower.includes('cơm')) return 'https://images.unsplash.com/photo-1603133872878-684f208fb84b?w=800';
        if (lower.includes('đậu hũ') || lower.includes('đậu phụ')) return 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=800';
        if (lower.includes('nấm') || lower.includes('canh')) return 'https://images.unsplash.com/photo-1540420773420-3366772f4999?w=800';
        if (lower.includes('rau') || lower.includes('kho quẹt')) return 'https://images.unsplash.com/photo-1512621776951-a57141f2eefd?w=800';
        if (lower.includes('chè') || lower.includes('xôi')) return 'https://images.unsplash.com/photo-1563805042-7684c019e1cb?w=800';
        return 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=800';
      };

      let slotsToApply = [];
      const extractSlot = (slotItem, slotName) => {
        if (!slotItem) return null;
        const mealName = slotItem.meal || slotItem.name || 'Món ăn';
        return {
          slot: slotName,
          meal: mealName,
          image: slotItem.image || getFallbackDishImage(mealName),
          cost: slotItem.cost || 0,
          calories: slotItem.calories || 0,
          ingredients: Array.isArray(slotItem.ingredients) ? slotItem.ingredients : []
        };
      };

      if (isOnlyLunch) {
        slotsToApply = [extractSlot(proposedMenu.lunch, 'lunch')].filter(Boolean);
      } else if (isOnlyDinner) {
        slotsToApply = [extractSlot(proposedMenu.dinner, 'dinner')].filter(Boolean);
      } else if (isOnlyBreakfast) {
        slotsToApply = [extractSlot(proposedMenu.breakfast, 'breakfast')].filter(Boolean);
      } else {
        slotsToApply = [
          extractSlot(proposedMenu.breakfast, 'breakfast'),
          extractSlot(proposedMenu.lunch, 'lunch'),
          extractSlot(proposedMenu.dinner, 'dinner')
        ].filter(Boolean);
      }

      // Execute Tool: writeUserCalendar
      const writeResult = await writeUserCalendar({
        date: targetDate,
        userId,
        slots: slotsToApply
      });

      console.log(`[Tool: writeUserCalendar] Saved ${writeResult.appliedCount} slots to DB for date: ${targetDate}`);

      const appliedSummary = slotsToApply.map(s => `- ${s.slot === 'breakfast' ? '🌅 Sáng' : s.slot === 'lunch' ? '☀️ Trưa' : '🌙 Tối'}: **${s.meal}** (~${formatVND(s.cost)}, ${s.calories} kcal)`).join('\n');

      systemDirective = `[JEV Calendar Action Directives]:
- Thành công: Đã lưu trực tiếp ${slotsToApply.length} món vào cơ sở dữ liệu Lịch ăn tháng ngày ${formatDateVN(targetDate)}:
${appliedSummary}
- Hãy xác nhận chúc mừng ${userPronoun} rằng kế hoạch ăn uống đã được đồng bộ vào hệ thống.
- Nhắc ${userPronoun} có thể mở trang "Lịch ăn tháng" để xem chi tiết hoặc chuẩn bị danh sách đi chợ tự động.`;

      richCards = {
        type: 'calendar_applied',
        data: {
          date: targetDate,
          formattedDate: formatDateVN(targetDate),
          appliedCount: slotsToApply.length,
          slots: slotsToApply
        }
      };

      quickSuggestions = [
        'Mở xem Lịch ăn tháng',
        'Tạo danh sách đi chợ cho ngày mai',
        'Gợi ý nguyên liệu rẻ gần đây',
        'Lên thực đơn ngày kia (06/10)'
      ];
    }
  }

  // ══════════════════════════════════════════════════════════════
  // FLOW 1.5: DECLINE PROPOSAL / CHANGE DISHES
  // ══════════════════════════════════════════════════════════════
  else if (hasProposedMenu && isDecline) {
    intent = 'DECLINE_PROPOSAL';
    systemDirective = `[JEV Directives]: ${userPronoun} vừa từ chối lưu thực đơn vào lịch ("${message}").
- Vui vẻ, nhẹ nhàng xác nhận rằng mình chưa lưu vào lịch.
- Hỏi ${userPronoun} muốn đổi bữa nào (sáng, trưa hay tối) hoặc có khẩu vị nào khác không (thích ăn cá, thịt heo, món canh thanh mát hay món xào...).
- Đưa ra các gợi ý thay thế bên dưới để ${userPronoun} dễ chọn.`;

    quickSuggestions = [
      'Đổi món bữa trưa',
      'Đổi món bữa tối',
      'Gợi ý thực đơn món mặn',
      'Tự chọn món ăn khác'
    ];
  }

    // ══════════════════════════════════════════════════════════════
  // FLOW 2: MEAL PLAN & QUESTION ENGINE (Clarification if missing info)
  // ══════════════════════════════════════════════════════════════
  else if (
    norm.includes('an chay') ||
    norm.includes('thuc don') ||
    norm.includes('len thuc don') ||
    norm.includes('ke hoach an') ||
    norm.includes('nau gi') ||
    norm.includes('an gi') ||
    norm.includes('50k') ||
    norm.includes('100k') ||
    norm.includes('tu nau') ||
    norm.includes('dat mon')
  ) {
    intent = 'MEAL_PLAN_BUDGET';
    if (norm.includes('chay') || norm.includes('an chay')) {
      setSessionState(effectiveSessionId, 'isVegetarian', true);
    }
    const targetDate = resolveDateFromText(message);
    setSessionState(effectiveSessionId, 'targetDate', targetDate);

    const hasBudget = /(\d+)\s*(k|nghin|ngan|tr|trieu|d|vnd|dong)/i.test(norm) || norm.includes('tiet kiem') || norm.includes('gia re');
    const hasCookingPref = norm.includes('tu nau') || norm.includes('nau tai nha') || norm.includes('mua ngoai') || norm.includes('dat ship') || norm.includes('an quan');

    // Missing critical info -> Trigger Question Engine!
    if (!hasBudget && !hasCookingPref && (norm.includes('an chay') || norm.includes('thuc don'))) {
      systemDirective = `[JEV Question Engine Directives]:
- Người dùng yêu cầu lên thực đơn (ví dụ: ăn chay cho ngày ${formatDateVN(targetDate)}) nhưng CHƯA nêu ngân sách và CHƯA nêu hình thức (tự nấu tại nhà hay mua quán/đặt ship).
- Tuyệt đối không phỏng đoán bừa mức tiền hoặc áp đặt món kỳ quặc.
- Hãy chủ động hỏi nhẹ nhàng, thân thiện để làm rõ 2 ý:
  1. ${userPronoun} dự định chi ngân sách khoảng bao nhiêu cho ngày này?
  2. ${userPronoun} thích tự nấu ăn tại nhà hay đặt món bên ngoài quán giao tận nơi?
- Giới thiệu các phương án lựa chọn nhanh bên dưới để ${userPronoun} tiện bấm chọn.`;

      quickSuggestions = [
        'Tự nấu tại nhà tiết kiệm (~30k - 40k)',
        'Tự nấu đủ món dinh dưỡng (~50k - 60k)',
        'Đặt món chay quán giao (~60k - 80k)',
        'Lên thực đơn 50K/ngày'
      ];
    } else {
      // Info is sufficient -> Generate authentic Vietnamese meal schedule!
      let budget = 50000;
      if (norm.includes('30k') || norm.includes('40k') || norm.includes('tiet kiem')) {
        budget = 40000;
      } else if (norm.includes('50k') || norm.includes('60k')) {
        budget = 50000;
      } else if (norm.includes('70k') || norm.includes('80k') || norm.includes('quan giao') || norm.includes('mua ngoai')) {
        budget = 75000;
      } else {
        const parsed = parseBudgetAndDays(message);
        budget = parsed.budget || 50000;
      }

      const isVegetarian = norm.includes('chay') || context.profile.dietary_goal?.includes('chay') || Boolean(getSessionState(effectiveSessionId, 'isVegetarian'));
      const isHomeCooking = !norm.includes('quan giao') && !norm.includes('mua ngoai') && !norm.includes('dat ship');

      const schedule = await generateMealSchedule({
        days: 1,
        budget,
        people: 1,
        isVegetarian,
        isHomeCooking
      });

      const daySlots = schedule.schedule[0].slots;
      // Cache proposed menu in session state so subsequent "áp dụng" command knows exactly what to write
      const formattedSlots = {
        breakfast: daySlots.breakfast ? { ...daySlots.breakfast, slot: 'breakfast', meal: daySlots.breakfast.name, image: daySlots.breakfast.image } : null,
        lunch: daySlots.lunch ? { ...daySlots.lunch, slot: 'lunch', meal: daySlots.lunch.name, image: daySlots.lunch.image } : null,
        dinner: daySlots.dinner ? { ...daySlots.dinner, slot: 'dinner', meal: daySlots.dinner.name, image: daySlots.dinner.image } : null
      };
      setSessionState(effectiveSessionId, 'proposedMenu', formattedSlots);
      setSessionState(effectiveSessionId, 'proposedDate', targetDate);

      const feasibility = await executeJev('feasibility', {
        days: 1,
        targetBudget: budget,
        people: 1
      });

      const scheduleSummary = [
        `- 🌅 **Bữa sáng:** ${daySlots.breakfast.name} (~${formatVND(daySlots.breakfast.cost)}, ${daySlots.breakfast.calories} kcal) [Nguyên liệu: ${daySlots.breakfast.ingredients.join(', ')}]`,
        `- ☀️ **Bữa trưa:** ${daySlots.lunch.name} (~${formatVND(daySlots.lunch.cost)}, ${daySlots.lunch.calories} kcal) [Nguyên liệu: ${daySlots.lunch.ingredients.join(', ')}]`,
        `- 🌙 **Bữa tối:** ${daySlots.dinner.name} (~${formatVND(daySlots.dinner.cost)}, ${daySlots.dinner.calories} kcal) [Nguyên liệu: ${daySlots.dinner.ingredients.join(', ')}]`
      ].join('\n');

      systemDirective = `[JEV Meal Plan Directives]:
- Đã tạo thực đơn chuẩn món ăn Việt Nam (${isVegetarian ? 'Thuần Chay thanh tịnh' : 'Món mặn gia đình'}) cho ngày ${formatDateVN(targetDate)}:
${scheduleSummary}
- Tổng chi phí: ~${formatVND(schedule.schedule[0].dayTotalCost)} (Ngân sách dự kiến: ${formatVND(budget)}).
- Đánh giá JEV Guard: ${feasibility.decision} (Điểm: ${feasibility.score}/1.0).
- Trình bày thực đơn bằng bảng Markdown đẹp mắt (Bữa, Tên món, Chi phí, Năng lượng).
- Nêu vài mẹo nấu ngon chuẩn vị cơm nhà Việt Nam (dùng nấm rơm, sả ớt, rau ngót, kho quẹt chay...).
- Cuối lời, hỏi ${userPronoun} có muốn áp dụng thực đơn này vào Lịch ăn tháng ngày mai (${formatDateVN(targetDate)}) không.`;

      richCards = {
        type: 'schedule_preview',
        data: schedule
      };

      quickSuggestions = [
        'Có, áp dụng vào lịch ăn ngày mai',
        'Không, đổi món khác',
        'Xem danh sách nguyên liệu đi chợ',
        'Tìm quán ăn đối tác gần tôi'
      ];
    }
  }

  // ══════════════════════════════════════════════════════════════
  // FLOW 3: PROFILE UPDATE & ADDRESS FORM
  // ══════════════════════════════════════════════════════════════
  else if (
    norm.includes('xung ho') ||
    norm.includes('anh em') ||
    norm.includes('chi em') ||
    norm.includes('ban minh') ||
    norm.includes('em anh')
  ) {
    intent = 'PROFILE_UPDATE';
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

    systemDirective = `[JEV Profile Update Directives]:
- Người dùng vừa chọn cách xưng hô: Gọi người dùng là "${userPronoun}" và tự xưng là "${botPronoun}".
- Xác nhận vui vẻ, thân thiện rằng ${botPronoun} đã lưu vào bộ nhớ cá nhân hóa và sẵn sàng hỗ trợ ${userPronoun}.`;

    quickSuggestions = [
      'Ăn 50K/ngày đủ chất không?',
      'Kế hoạch chi tiêu 1.5 triệu/tháng',
      'Tạo thực đơn ăn chay ngày mai'
    ];
  }

    // ══════════════════════════════════════════════════════════════
  // FLOW 2.5: IMMEDIATE HUNGER / QUICK MEAL RELIEF
  // ══════════════════════════════════════════════════════════════
  else if (intent === 'HUNGRY_IMMEDIATE' || norm.includes('doi qua') || norm.includes('doi bung') || norm.includes('doi roi') || norm.includes('them an')) {
    intent = 'HUNGRY_IMMEDIATE';
    const deals = await searchRescueDeals({ maxPrice: 40000, limit: 3 });
    if (deals && deals.length > 0) {
      richCards = {
        type: 'deals_list',
        data: deals
      };
    }

    systemDirective = `[JEV Directives]: ${userPronoun} đang kêu đói ("${message}").
- Hãy chia sẻ cảm xúc ấm áp, đồng cảm ngay lập tức với ${userPronoun}.
- Gợi ý 2 giải pháp cứu đói cấp tốc:
  1. Gợi ý 2-3 món nấu/chuẩn bị siêu nhanh tại nhà trong 5-10 phút với nguyên liệu bình dân (như bánh mì ốp la xúc xích, mì xào trứng rau cải, cơm chiên trứng nhanh...).
  2. Giới thiệu các suất ăn giải cứu giờ vàng từ đối tác FoodSaver gần ${userPronoun} (giá chỉ từ 15k - 30k) nếu ${userPronoun} không muốn vào bếp.
- Tuyệt đối KHÔNG ép ${userPronoun} ăn chay trừ khi họ yêu cầu.`;

    quickSuggestions = [
      'Săn deal giải cứu gần tôi',
      'Món nấu nhanh dưới 10 phút',
      'Ăn gì dưới 30k'
    ];
  }

  // ══════════════════════════════════════════════════════════════
  // FLOW 4: RESCUE DEALS SEARCH
  // ══════════════════════════════════════════════════════════════
  else if (
    norm.includes('giai cuu') ||
    norm.includes('can date') ||
    norm.includes('gio vang') ||
    norm.includes('giam gia') ||
    norm.includes('deal')
  ) {
    intent = 'RESCUE_DEAL_SEARCH';
    const deals = await searchRescueDeals({ maxPrice: 40000, limit: 4 });
    richCards = {
      type: 'deals_list',
      data: deals
    };
    systemDirective = `[JEV Rescue Deals Search Directives]:
- Tìm thấy ${deals.length} suất ăn cận date giá giảm:
${deals.map((d, i) => `${i + 1}. ${d.title} - ${formatVND(d.discountPrice)} (Gốc: ${formatVND(d.originalPrice)}) - Quán: ${d.partnerName}`).join('\n')}
- Hãy giới thiệu cho ${userPronoun} và gợi ý mở Bản đồ để nhận món.`;

    quickSuggestions = [
      'Xem trên Bản đồ FoodSaver',
      'Lên thực đơn ăn 3 ngày',
      'Mẹo bảo quản thực phẩm cận date'
    ];
  }

  // ══════════════════════════════════════════════════════════════
  // FLOW 5: CHITCHAT & GENERAL QA
  // ══════════════════════════════════════════════════════════════
  else if (norm === 'chao' || norm === 'hello' || norm === 'hi' || norm === 'chao ban' || norm.includes('cam on')) {
    intent = 'CHITCHAT';
    systemDirective = `[JEV Directives]: Người dùng đang chào hỏi hoặc cảm ơn. Chào lại ${userPronoun} thật tươi vui, ấm áp, giới thiệu ${botPronoun} là Trợ lý Dinh dưỡng & Tài chính FoodSaver và gợi ý 1 câu hỏi thú vị.`;
    quickSuggestions = [
      'Ăn 50K/ngày đủ chất không?',
      'Tạo thực đơn ăn chay ngày mai',
      'Có món gì giải cứu gần tôi?'
    ];
  } else {
    intent = 'QA_INFO';
    systemDirective = `[JEV Directives]: Người dùng đang hỏi đáp kiến thức ẩm thực, chợ giá rẻ tại TP.HCM hoặc cách bảo quản thực phẩm. Trả lời chi tiết, thực tế, bổ ích.`;
    quickSuggestions = [
      'Lập kế hoạch ăn uống',
      'Tìm chợ giá rẻ ở TP.HCM',
      'Cách bảo quản thực phẩm cận date'
    ];
  }

  const systemPrompt = `Bạn là Trợ lý Dinh dưỡng & Tài chính FoodSaver – một trợ lý AI thông minh, nhiệt thành và thực tế.
XƯNG HÔ BẮT BUỘC:
- Luôn luôn tự xưng là "${botPronoun}".
- Luôn luôn gọi người dùng là "${userPronoun}".
- Tuyệt đối giữ đúng cặp xưng hô này trong toàn bộ câu trả lời.

NGUYÊN TẮC TRẢ LỜI:
1. TRẢ LỜI ĐÚNG TRỌNG TÂM: Lắng nghe chính xác mong muốn và cảm xúc của ${userPronoun}. Không gượng ép sang chủ đề không liên quan (ví dụ: ${userPronoun} kêu đói thì gợi ý giải pháp ăn ngay hoặc suất ăn giải cứu quanh đây, tuyệt đối không tự dưng ép ăn chay).
2. ẨM THỰC CHUẨN VIỆT: Mọi món ăn, mẹo nấu và nguyên liệu luôn theo phong vị cơm nhà Việt Nam. Chỉ gợi ý món chay khi ${userPronoun} có yêu cầu hoặc sở thích ăn chay.
3. KHÔNG BỊA ĐẶT CÁC CHỈ SỐ LẠ: Tuyệt đối không tự bịa ra các cột hay trường như "Điểm JEV Guard" hay "Suất ăn giải cứu (g)" trong bảng biểu.
4. TRÌNH BÀY ĐẸP MẮT: Sử dụng Markdown (in đậm tiêu đề, bảng biểu rõ ràng khi cần, icon trực quan, danh sách ngắn gọn).
5. Tuyệt đối không để lộ các thẻ kỹ thuật như [JEV Directives].

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

function generateContextualFallback(pipeline) {
  const userPronoun = pipeline.context.profile.address_form || 'bạn';
  const botPronoun = pipeline.context.profile.bot_form || (userPronoun === 'Anh' || userPronoun === 'Chị' ? 'em' : 'mình');

  if (pipeline.intent === 'WRITE_CALENDAR') {
    if (pipeline.richCards?.type === 'calendar_conflict') {
      const formattedDate = pipeline.richCards.data?.formattedDate || 'ngày mai';
      return 'Dạ ' + userPronoun + ' ơi, trong hệ thống của ' + userPronoun + ' vào ngày ' + formattedDate + ' hiện đã có các món ăn lên sẵn. ' + botPronoun + ' đã liệt kê chi tiết các bữa hiện có ở bảng bên dưới. ' + userPronoun + ' có muốn thay thế toàn bộ hay chỉ đổi riêng từng bữa (sáng, trưa, tối) không ạ?';
    }
    if (pipeline.richCards?.type === 'calendar_applied') {
      const formattedDate = pipeline.richCards.data?.formattedDate || 'ngày mai';
      return 'Tuyệt vời ' + userPronoun + ' ơi! ' + botPronoun + ' đã đồng bộ thành công ' + (pipeline.richCards.data?.appliedCount || '') + ' món ăn vào cơ sở dữ liệu Lịch ăn tháng ngày ' + formattedDate + '. ' + userPronoun + ' có thể mở trang Lịch ăn tháng để xem hoặc bắt đầu lập danh sách đi chợ nhé!';
    }
  }

  if (pipeline.intent === 'MEAL_PLAN_BUDGET') {
    return 'Chào ' + userPronoun + '! ' + botPronoun + ' đã tính toán xong kế hoạch ăn uống cân đối dinh dưỡng và tiết kiệm theo đúng thực phẩm Việt Nam. ' + userPronoun + ' xem bảng chi tiết và bấm chọn các phương án bên dưới nhé!';
  }

  return 'Chào ' + userPronoun + '! ' + botPronoun + ' là Trợ lý Dinh dưỡng & Tài chính FoodSaver, luôn sẵn sàng hỗ trợ ' + userPronoun + ' lên kế hoạch chi tiêu ăn uống hợp lý và dinh dưỡng.';
}

export async function processChatMessage({ message, userId, sessionId }) {
  const pipeline = await prepareChatPipeline({ message, userId, sessionId });

  let replyText = '';
  try {
    replyText = await generateLLMResponse({
      systemPrompt: pipeline.systemPrompt,
      messages: pipeline.llmMessages,
      maxTokens: 1400,
      temperature: 0.6
    });
  } catch (err) {
    console.warn('[LLM Generate Error, using fallback]:', err.message);
    replyText = generateContextualFallback(pipeline);
  }

  appendSessionTurn(pipeline.effectiveSessionId, 'assistant', replyText);

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
      maxTokens: 1400,
      temperature: 0.6
    });
  } catch (err) {
    console.warn('[LLM Stream Error, using fallback]:', err.message);
    fullReply = generateContextualFallback(pipeline); if (onToken) onToken(fullReply);
    if (onToken) onToken(fullReply);
  }

  appendSessionTurn(pipeline.effectiveSessionId, 'assistant', fullReply);

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
