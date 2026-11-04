import fs from 'node:fs/promises';
import path from 'node:path';
import { collectionRoutes } from '../web/routes.js';

export async function writeCollectionPages(directory, catalog) {
  const html = (await fs.readFile(path.join(directory, 'index.html'), 'utf8')).replace('<base href="./">', '<base href="../">');
  for (const slug of collectionRoutes(catalog.collections).values()) {
    const target = path.join(directory, slug);
    await fs.mkdir(target, { recursive: true });
    await fs.writeFile(path.join(target, 'index.html'), html);
  }
}
