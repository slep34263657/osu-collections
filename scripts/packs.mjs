import path from 'node:path';
import fs from 'node:fs';
import { pipeline } from 'node:stream/promises';
import yazl from 'yazl';

export async function writePacks(sets, { artifacts, id, sourceAsset, buffer, limit = 1800 * 1024 ** 2 }) {
  const groups = []; let group = [], size = buffer.length;
  for (const set of sets) {
    if (size + set.bytes > limit && group.length) { groups.push(group); group = []; size = buffer.length; }
    group.push(set); size += set.bytes;
  }
  if (group.length) groups.push(group);
  const assets = [];
  for (const [i, maps] of groups.entries()) {
    const asset = `pack-${id}${groups.length > 1 ? `-part-${i + 1}` : ''}.zip`;
    const zip = new yazl.ZipFile();
    zip.addBuffer(buffer, sourceAsset);
    for (const map of maps) zip.addFile(path.join(artifacts, map.asset), map.asset, { compress: false });
    const done = pipeline(zip.outputStream, fs.createWriteStream(path.join(artifacts, asset)));
    zip.end(); await done;
    if ((await fs.promises.stat(path.join(artifacts, asset))).size >= 2 * 1024 ** 3) throw new Error(`${asset} exceeds GitHub's 2 GiB file limit`);
    assets.push(asset);
  }
  return assets;
}
