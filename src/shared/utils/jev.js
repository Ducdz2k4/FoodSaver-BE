import { env } from '../../config/env.js';
import { ApiError } from './apiError.js';

/**
 * Đánh giá món ăn cận date bằng mô hình AI System One: Jev (TypeSafe AI)
 * @param {Object} listing - Thông tin món ăn
 * @returns {Promise<{ urgencyScore: number, wasteRisk: string, shouldDeepDiscount: boolean, confidence: number }>}
 */
export async function evaluateListingWithJev(listing) {
  if (!env.jev.apiKey) {
    throw ApiError.serviceUnavailable('Jev AI chưa được cấu hình. Không thể đánh giá listing lúc này.');
  }

  const hoursRemaining = Math.max(
    0.1,
    (new Date(listing.expiryAt).getTime() - Date.now()) / 3600000
  );

  const payload = {
    model: env.jev.model || 'jev-latest',
    state: {
      title: listing.title,
      category: listing.category,
      hours_until_expiry: Number(hoursRemaining.toFixed(2)),
      quantity_remaining: listing.quantity,
      original_price_vnd: Number(listing.originalPrice),
      discount_price_vnd: Number(listing.discountPrice),
      pickup_window: `${listing.pickupStartTime} - ${listing.pickupEndTime}`
    },
    questions: {
      waste_risk: {
        type: 'choice',
        instructions:
          'Evaluate the risk of this surplus food becoming waste based on expiry hours remaining, quantity, and food category perishability.',
        criteria: {
          LOW: 'Surplus food has plenty of time remaining (>8h) and very low waste risk',
          MEDIUM: 'Surplus food has moderate time (4h-8h) with normal risk',
          HIGH: 'Surplus food has tight time window (2h-4h) with considerable waste risk',
          CRITICAL: 'Surplus food expires in under 2 hours with extreme risk of food waste'
        }
      },
      urgency_score: {
        type: 'score',
        instructions:
          'Rate the urgency of rescue intervention from level 0 (not urgent) to level 4 (critical emergency rescue needed)',
        criteria: [
          'Level 0: Not urgent at all',
          'Level 1: Low urgency',
          'Level 2: Moderate urgency',
          'Level 3: High urgency',
          'Level 4: Critical emergency rescue within 2 hours'
        ]
      },
      should_deep_discount: {
        type: 'noul',
        instructions:
          'Should the merchant apply a deep clearance discount of 70% or more to guarantee complete sellout before closing?'
      }
    }
  };

  try {
    const response = await fetch(env.jev.apiUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${env.jev.apiKey}`,
        'Content-Type': 'application/json',
        'User-Agent': 'FoodSaver-SystemOne/1.0'
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error(`[Jev AI Error] Status ${response.status}: ${errText}`);
      throw new Error(`Jev AI evaluation failed with status ${response.status}`);
    }

    const data = await response.json();
    const answers = data.answers || {};

    const rawScore = answers.urgency_score?.score ?? 2.0; // scale 0-4
    const normalizedScore = Number(Math.min(1.0, Math.max(0.0, rawScore / 4)).toFixed(2));
    const wasteRisk = answers.waste_risk?.choice || 'MEDIUM';
    const confidence = answers.waste_risk?.confidence ?? 0.8;
    const shouldDeepDiscount = (answers.should_deep_discount?.noul ?? 0.5) >= 0.5;

    return {
      urgencyScore: normalizedScore,
      wasteRisk,
      shouldDeepDiscount,
      confidence,
      modelUsed: data.model
    };
  } catch (error) {
    console.error('[Jev AI Execution Error]:', error.message);
    throw ApiError.serviceUnavailable('Jev AI không phản hồi. Vui lòng thử lại sau.');
  }
}
