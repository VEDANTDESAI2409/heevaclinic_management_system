import fs from 'node:fs';
import path from 'node:path';

async function main() {
  const dataDir = path.resolve('server/data');
  console.log('Inspecting JSON Storage:', dataDir);

  if (!fs.existsSync(dataDir)) {
    console.log('Data directory does not exist yet.');
    return;
  }

  const files = fs.readdirSync(dataDir).filter((f) => f.endsWith('.json'));
  console.log(`Found ${files.length} collections:\n`);

  for (const f of files.sort()) {
    const filePath = path.join(dataDir, f);
    try {
      const content = fs.readFileSync(filePath, 'utf8');
      const data = JSON.parse(content || '[]');
      const name = f.replace('.json', '');
      console.log(`Collection "${name}": ${Array.isArray(data) ? data.length : 1} items`);
      if (Array.isArray(data) && data.length > 0) {
        console.log('Sample:', JSON.stringify(data[0], null, 2));
      }
    } catch (e) {
      console.error(`Error reading ${f}:`, e.message);
    }
  }
}

main().catch(console.error);
