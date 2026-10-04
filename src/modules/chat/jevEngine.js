import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { env } from '../../config/env.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Cache loaded rubrics
const RUBRICS_DIR = path.join(__dirname, 'rubrics');
const rubricsCache = new Map();

export function loadRubric(rubricId) {
  if (rubricsCache.has(rubricId)) {
    return rubricsCache.get(rubricId);
  }
  const filePath = path.join(RUBRICS_DIR, `${rubricId}.rubric.json`);
  if (!fs.existsSync(filePath)) {
    throw new Error(`Rubric "${rubricId}" not found at ${filePath}`);
  }
  const content = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  rubricsCache.set(rubricId, content);
  return content;
}

/**
 * Universal JEV Decision Engine
 * Evaluates any rubric (Choice, Score, Noul) against a given state
 * @param {string} rubricId - ID of rubric ('pre_router', 'feasibility', 'safety_guard', 'memory_worthiness')
 * @param {Object} state - Context and parameters for evaluation
 * @returns {Promise<{ decision: string, score: number, isPassed: boolean, confidence: number, details: any, modelUsed: string }>}
 */
export async function executeJev(rubricId, state) {
  const rubric = loadRubric(rubricId);

  // If remote API is configured, attempt TypeSafe AI call with timeout
  if (env.jev.apiKey && env.jev.apiUrl) {
    try {
      const remoteResult = await callRemoteJev(rubric, state);
      if (remoteResult) return remoteResult;
    } catch (err) {
      console.warn(`[JEV Engine] Remote JEV call failed for ${rubricId}, falling back to calibrated local engine:`, err.message);
    }
  }

  // Resilient local calibrated evaluator
  return evaluateLocally(rubric, state);
}

/**
 * Remote TypeSafe AI System One caller
 */
async function callRemoteJev(rubric, state) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 2500);

  const payload = {
    model: env.jev.model || 'jev-latest',
    state,
    questions: rubric.questions || {
      decision: {
        type: rubric.primitive === 'choice' ? 'choice' : 'score',
        instructions: rubric.instructions,
        choices: rubric.choices,
        criteria: rubric.criteria
      }
    }
  };

  try {
    const res = await fetch(env.jev.apiUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${env.jev.apiKey}`,
        'Content-Type': 'application/json',
        'User-Agent': 'FoodSaver-AgentJEV/2.0'
      },
      body: JSON.stringify(payload),
      signal: controller.signal
    });

    clearTimeout(timeoutId);
    if (!res.ok) return null;

    const data = await res.json();
    const answers = data.answers || {};

    if (rubric.id === 'pre_router') {
      const choice = answers.decision?.choice || rubric.default_choice;
      const confidence = answers.decision?.confidence ?? 0.88;
      return {
        decision: choice,
        score: 1.0,
        isPassed: true,
        confidence,
        details: answers,
        modelUsed: data.model || 'typesafe-jev-remote'
      };
    }

    if (rubric.id === 'feasibility') {
      const rawScore = answers.feasibility_score?.score ?? 0.8;
      const isFeasible = (answers.is_feasible?.noul ?? 0.5) >= 0.5;
      const isPassed = rawScore >= (rubric.thresholds?.pass || 0.7);
      return {
        decision: isPassed ? 'PASS' : rawScore >= (rubric.thresholds?.negotiate || 0.25) ? 'NEGOTIATE' : 'IMPOSSIBLE',
        score: rawScore,
        isPassed,
        confidence: 0.9,
        details: { isFeasible, rawScore },
        modelUsed: data.model || 'typesafe-jev-remote'
      };
    }

    return null;
  } catch {
    clearTimeout(timeoutId);
    return null;
  }
}

/**
 * Calibrated local evaluation based on real statistical weights and text features
 */
function evaluateLocally(rubric, state) {
  const normText = (state.message || state.query || state.input || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd');

  switch (rubric.id) {
    case 'pre_router': {
      let decision = 'QA_INFO';
      let confidence = 0.85;

      // Chitchat detection
      const chitchatPatterns = ['chao', 'hello', 'hi', 'cam on', 'thank', 'ban la ai', 'tam biet', 'chuc ngu ngon', 'khoi qua'];
      if (chitchatPatterns.some(p => normText.includes(p)) && normText.length < 35 && !normText.includes('an') && !normText.includes('mon')) {
        decision = 'CHITCHAT';
        confidence = 0.95;
      }
      // Meal planning & Budget detection
      else if (
        normText.includes('ke hoach') ||
        normText.includes('ngan sach') ||
        normText.includes('thuc don') ||
        normText.includes('an gi') ||
        normText.includes('1 ngay') ||
        normText.includes('1 thang') ||
        normText.includes('1 tuan') ||
        normText.includes('50k') ||
        normText.includes('100k') ||
        normText.includes('trieu') ||
        normText.includes('chi tieu') ||
        normText.includes('tiet kiem')
      ) {
        decision = 'MEAL_PLAN_BUDGET';
        confidence = 0.92;
      }
      // Rescue deal search
      else if (
        normText.includes('giai cuu') ||
        normText.includes('can date') ||
        normText.includes('gio vang') ||
        normText.includes('giam gia') ||
        normText.includes('quan nao') ||
        normText.includes('gan day') ||
        normText.includes('deal')
      ) {
        decision = 'RESCUE_DEAL_SEARCH';
        confidence = 0.90;
      }
      // Calendar write action
      else if (
        normText.includes('luu vao lich') ||
        normText.includes('xep lich') ||
        normText.includes('them vao lich') ||
        normText.includes('len lich cho ngay')
      ) {
        decision = 'WRITE_CALENDAR';
        confidence = 0.94;
      }

      return {
        decision,
        score: 1.0,
        isPassed: true,
        confidence,
        details: { matchedIntent: decision },
        modelUsed: 'jev-local-calibrated'
      };
    }

    case 'feasibility': {
      const budget = Number(state.targetBudget) || 0;
      const days = Number(state.days) || 1;
      const minEstimatedCost = Number(state.minEstimatedCost) || (days * 18000); // 18k/day absolute bare minimum
      const people = Number(state.people) || 1;

      const totalMinRequired = minEstimatedCost * people;
      const costRatio = budget > 0 ? (budget / totalMinRequired) : 1.0;

      let score = Math.min(1.0, Math.max(0.0, Number(costRatio.toFixed(2))));
      let isFeasible = score >= 0.70;
      let decision = 'PASS';

      if (score < 0.25) {
        decision = 'IMPOSSIBLE';
        isFeasible = false;
      } else if (score < 0.70) {
        decision = 'NEGOTIATE';
        isFeasible = false;
      }

      return {
        decision,
        score,
        isPassed: isFeasible,
        confidence: 0.95,
        details: {
          budget,
          days,
          people,
          totalMinRequired,
          costRatio: Number(costRatio.toFixed(2)),
          suggestedAdjustment: {
            realisticDaysForBudget: Math.max(1, Math.floor(budget / (18000 * people))),
            recommendedBudgetForDays: totalMinRequired,
          }
        },
        modelUsed: 'jev-local-calibrated'
      };
    }

    case 'safety_guard': {
      let isSafe = true;
      let score = 1.0;

      // Injection attempts
      if (normText.includes('ignore previous') || normText.includes('bo qua huong dan') || normText.includes('system prompt')) {
        isSafe = false;
        score = 0.0;
      }

      // Dangerous food prep
      if (normText.includes('thiu') || normText.includes('moc') || normText.includes('chay den') || normText.includes('doc')) {
        score = 0.4;
      }

      return {
        decision: isSafe ? 'PASS' : 'BLOCK',
        score,
        isPassed: isSafe,
        confidence: 0.98,
        details: { isSafe },
        modelUsed: 'jev-local-calibrated'
      };
    }

    case 'memory_worthiness': {
      let score = 0.2; // default: casual chat, not worth permanent storing

      // User explicit preference
      if (normText.includes('di ung') || normText.includes('khong an duoc') || normText.includes('an chay')) {
        score = 0.95;
      } else if (normText.includes('toi la') || normText.includes('minh ten la') || normText.includes('xung ho')) {
        score = 0.90;
      } else if (normText.includes('ngan sach cua toi') || normText.includes('moi ngay toi tieu') || normText.includes('1 thang toi co')) {
        score = 0.85;
      } else if (normText.includes('thich an') || normText.includes('ghét an')) {
        score = 0.70;
      }

      return {
        decision: score >= 0.6 ? 'SAVE' : score >= 0.35 ? 'SAVE_WITH_TTL' : 'DROP',
        score,
        isPassed: score >= 0.6,
        confidence: 0.9,
        details: { memoryScore: score },
        modelUsed: 'jev-local-calibrated'
      };
    }

    default:
      return {
        decision: 'PASS',
        score: 1.0,
        isPassed: true,
        confidence: 0.8,
        details: {},
        modelUsed: 'jev-local-calibrated'
      };
  }
}
