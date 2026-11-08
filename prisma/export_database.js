import { PrismaClient } from '@prisma/client';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const prisma = new PrismaClient();

// Models in strict dependency order for seeding
const models = [
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

async function main() {
  console.log('[Export] Exporting all database data...');
  const data = {};
  const stats = {};

  for (const m of models) {
    if (typeof prisma[m]?.findMany === 'function') {
      try {
        const rows = await prisma[m].findMany();
        data[m] = rows;
        stats[m] = rows.length;
      } catch (err) {
        console.error(`Error exporting ${m}:`, err.message);
        data[m] = [];
        stats[m] = 0;
      }
    }
  }

  const outDir = path.join(__dirname, 'data');
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }

  const outFile = path.join(outDir, 'db_dump.json');
  fs.writeFileSync(outFile, JSON.stringify(data, null, 2), 'utf8');

  console.log('[Export] Finished! Stats:');
  console.table(stats);
  console.log(`Saved to ${outFile} (${(fs.statSync(outFile).size / 1024).toFixed(1)} KB)`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
