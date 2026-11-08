import { PrismaClient } from '@prisma/client';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const prisma = new PrismaClient();

const modelsInOrder = [
  'user',
  'userProfile',
  'userTrust',
  'trustEvent',
  'partnerProfile',
  'partnerWallet',
  'partnerReceivable',
  'feeRule',
  'listing',
  'recipe',
  'mealPlan',
  'communityPost',
  'communityComment',
  'communityLike',
  'communityBookmark',
  'inventoryReservation',
  'order',
  'orderStatusHistory',
  'orderReview',
  'payment',
  'ledgerAccount',
  'ledgerTransaction',
  'ledgerEntry',
  'chatSession',
  'chatMessage',
  'orderChatThread',
  'orderChatMessage',
  'notification',
  'foodSafetyReport'
];

function parseDatesAndRefresh(modelName, rows) {
  const now = Date.now();
  return rows.map((row) => {
    const parsed = {};
    for (const [k, v] of Object.entries(row)) {
      if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(v)) {
        parsed[k] = new Date(v);
      } else {
        parsed[k] = v;
      }
    }

    // Refresh listing expiration so listings are always fresh & active on map
    if (modelName === 'listing') {
      const expTime = parsed.expiryAt ? parsed.expiryAt.getTime() : 0;
      if (expTime <= now) {
        // Give 48 hours from current moment
        parsed.expiryAt = new Date(now + 48 * 3600 * 1000);
        parsed.pickupStartTime = new Date(now - 1 * 3600 * 1000);
        parsed.pickupEndTime = new Date(now + 48 * 3600 * 1000);
        if (parsed.status === 'EXPIRED') {
          parsed.status = 'AVAILABLE';
        }
      }
    }

    return parsed;
  });
}

export async function seedFullDatabase() {
  const dumpPath = path.join(__dirname, 'data', 'db_dump.json');
  if (!fs.existsSync(dumpPath)) {
    throw new Error(`Dump file not found at ${dumpPath}. Please run export_database.js first.`);
  }

  const dump = JSON.parse(fs.readFileSync(dumpPath, 'utf8'));
  console.log('🚀 [Seed Full] Seeding complete database snapshot from db_dump.json...');

  const stats = {};

  for (const model of modelsInOrder) {
    const rawRows = dump[model];
    if (!rawRows || !Array.isArray(rawRows) || rawRows.length === 0) {
      stats[model] = 0;
      continue;
    }

    const processedRows = parseDatesAndRefresh(model, rawRows);

    try {
      if (typeof prisma[model]?.createMany === 'function') {
        const res = await prisma[model].createMany({
          data: processedRows,
          skipDuplicates: true,
        });
        stats[model] = res.count;
      } else {
        let count = 0;
        for (const row of processedRows) {
          await prisma[model].upsert({
            where: { id: row.id },
            update: row,
            create: row,
          });
          count++;
        }
        stats[model] = count;
      }
    } catch (err) {
      console.warn(`[Seed Full] createMany warning on ${model}: ${err.message}. Retrying individual upserts...`);
      let count = 0;
      for (const row of processedRows) {
        try {
          await prisma[model].upsert({
            where: { id: row.id },
            update: row,
            create: row,
          });
          count++;
        } catch (innerErr) {
          // ignore duplicate / skip
        }
      }
      stats[model] = count;
    }
  }

  console.log('✅ [Seed Full] Database seeded successfully!');
  console.table(stats);
}

// Allow direct execution: node prisma/seed_full.js
if (process.argv[1] && process.argv[1].endsWith('seed_full.js')) {
  seedFullDatabase()
    .catch((e) => {
      console.error('❌ [Seed Full] Error:', e);
      process.exit(1);
    })
    .finally(() => prisma.$disconnect());
}
