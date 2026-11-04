export function collectionRoutes(collections) {
  const used = new Set(['covers', 'previews', 'assets', 'index', '404']);
  return new Map(collections.map(collection => {
    const name = collection.name.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'collection';
    let slug = name;
    if (used.has(slug)) slug = `${name}-${collection.id.replace(/[^a-z0-9-]/gi, '')}`;
    while (used.has(slug)) slug += '-2';
    used.add(slug); return [collection.id, slug];
  }));
}
