import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { executeJev } from './jevEngine.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Tier 1: Session Memory (In-memory LRU cache of conversation turns)
const sessionStore = new Map(); // sessionId -> Message[]

// Tier 2 & 3: Profile & Fact Store (userId / sessionId -> Map<key, Fact>)
const userFactsStore = new Map();

// Load Profile Schema
const profileSchema = JSON.parse(
  fs.readFileSync(path.join(__dirname, 'rubrics', 'profile_schema.json'), 'utf8')
);

function stripVietnamese(str) {
  return (str || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd');
}

/**
 * Context Builder (< 30ms parallel assembly)
 */
export async function buildContext({ userId, sessionId, currentMessage }) {
  const effectiveId = userId || sessionId || 'anonymous';

  // 1. Get recent session history (last 8 turns)
  const sessionHistory = sessionStore.get(effectiveId) || [];
  const recentTurns = sessionHistory.slice(-8);

  // 2. Get active user facts
  const factsMap = userFactsStore.get(effectiveId) || new Map();
  const activeFacts = {};
  for (const [k, f] of factsMap.entries()) {
    if (!f.isSuperseded) {
      activeFacts[k] = f.value;
    }
  }

  // 3. Question Engine: Calculate missing fields & determine if we should ask
  const missingFields = profileSchema.fields.filter(f => !activeFacts[f.key]);
  missingFields.sort((a, b) => a.priority - b.priority);

  return {
    userId: effectiveId,
    profile: activeFacts,
    recentTurns,
    missingFields,
    suggestedQuestion: missingFields.length > 0 ? missingFields[0] : null
  };
}

/**
 * Save turn into session memory
 */
export function appendSessionTurn(sessionId, role, content) {
  if (!sessionStore.has(sessionId)) {
    sessionStore.set(sessionId, []);
  }
  const history = sessionStore.get(sessionId);
  history.push({
    role,
    content,
    timestamp: new Date().toISOString()
  });
  if (history.length > 30) {
    history.shift();
  }
}

/**
 * Async Memory Extractor
 * Uses JEV memory_worthiness rubric to evaluate whether user message contains facts worth saving
 */
/**
 * Explicitly save user fact (called by controllers/handlers)
 */
export function saveUserFact(effectiveId, key, value, ttlDays = null) {
  if (!userFactsStore.has(effectiveId)) {
    userFactsStore.set(effectiveId, new Map());
  }
  const store = userFactsStore.get(effectiveId);
  const existing = store.get(key);
  if (existing) {
    existing.isSuperseded = true;
  }
  store.set(key, {
    key,
    value,
    confidence: 1.0,
    jevScore: 1.0,
    createdAt: new Date().toISOString(),
    ttlDays,
    isSuperseded: false
  });
  console.log(`[Memory Engine] Explicitly saved fact for ${effectiveId}: ${key} = "${value}"`);
}

export async function extractAndSaveMemoryAsync({ userId, sessionId, message }) {
  const effectiveId = userId || sessionId || 'anonymous';
  const stripped = stripVietnamese(message);

  const candidateFacts = [];

  // Address form detection
  const nameMatch = stripped.match(/(?:goi toi la|goi minh la|xung ho la)\s+([a-z\s]+?)(?:nhe|\.|,|$)/);
  if (nameMatch) {
    const val = nameMatch[1].trim();
    if (val.length > 0) {
      candidateFacts.push({ key: 'address_form', value: val.charAt(0).toUpperCase() + val.slice(1) });
    }
  }

  // Allergy detection
  const allergyMatch = stripped.match(/(?:di ung|kieng an|khong an duoc)\s+([a-z\s,]+?)(?:nhe|\.|,|$)/);
  if (allergyMatch) {
    const val = allergyMatch[1].trim();
    if (val.length > 0) {
      candidateFacts.push({ key: 'allergies', value: val });
    }
  }

  // Budget habit detection
  const budgetMatch = stripped.match(/(?:ngan sach|moi ngay tieu|moi ngay an)\s*[:=]?\s*(\d+[\s.]*(?:k|nghin|ngan|tr|trieu|d))/);
  if (budgetMatch) {
    candidateFacts.push({ key: 'daily_budget_target', value: budgetMatch[1].trim() });
  }

  // Dietary goal detection
  if (stripped.includes('giam can') || stripped.includes('tang co') || stripped.includes('an chay') || stripped.includes('eat clean')) {
    let goal = 'Ăn uống tiết kiệm';
    if (stripped.includes('giam can')) goal = 'Giảm cân lành mạnh';
    if (stripped.includes('tang co')) goal = 'Tăng cơ giàu protein';
    if (stripped.includes('an chay')) goal = 'Ăn chay thanh tịnh';
    if (stripped.includes('eat clean')) goal = 'Eat clean đủ chất';
    candidateFacts.push({ key: 'dietary_goal', value: goal });
  }

  if (candidateFacts.length === 0) return;

  // Run JEV Memory Worthiness evaluation
  const jevEval = await executeJev('memory_worthiness', { input: message });
  if (jevEval.decision === 'DROP') return;

  if (!userFactsStore.has(effectiveId)) {
    userFactsStore.set(effectiveId, new Map());
  }
  const store = userFactsStore.get(effectiveId);

  for (const fact of candidateFacts) {
    const existing = store.get(fact.key);
    if (existing) {
      existing.isSuperseded = true;
    }

    store.set(fact.key, {
      key: fact.key,
      value: fact.value,
      confidence: jevEval.confidence || 0.9,
      jevScore: jevEval.score,
      createdAt: new Date().toISOString(),
      ttlDays: jevEval.decision === 'SAVE_WITH_TTL' ? 14 : null,
      isSuperseded: false
    });

    console.log(`[Memory Engine] Saved fact for ${effectiveId}: ${fact.key} = "${fact.value}" (JEV Score: ${jevEval.score})`);
  }
}

/**
 * Get all facts for inspection / user transparency
 */
export function getUserFacts(effectiveId) {
  const store = userFactsStore.get(effectiveId) || new Map();
  const list = [];
  for (const [key, fact] of store.entries()) {
    if (!fact.isSuperseded) {
      list.push(fact);
    }
  }
  return list;
}

/**
 * Delete a specific fact
 */
export function deleteUserFact(effectiveId, key) {
  const store = userFactsStore.get(effectiveId);
  if (store && store.has(key)) {
    store.delete(key);
    return true;
  }
  return false;
}

/**
 * Clear session memory
 */

// Temporary Session States (e.g. proposed menus, pending calendar updates)
const sessionStateStore = new Map();

export function setSessionState(sessionId, key, value) {
  if (!sessionStateStore.has(sessionId)) {
    sessionStateStore.set(sessionId, {});
  }
  const state = sessionStateStore.get(sessionId);
  state[key] = value;
}

export function getSessionState(sessionId, key) {
  const state = sessionStateStore.get(sessionId) || {};
  return key ? state[key] : state;
}

export function clearSessionState(sessionId) {
  sessionStateStore.delete(sessionId);
}

export function clearSessionMemory(effectiveId) {
  sessionStore.delete(effectiveId);
  sessionStateStore.delete(effectiveId);
  return true;
}
