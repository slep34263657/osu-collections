const $ = id => document.getElementById(id);
const element = (tag, className, text) => { const node = document.createElement(tag); if (className) node.className = className; if (text !== undefined) node.textContent = text; return node; };
const button = (text, href, primary = false) => {
  const a = element('a', `button${primary ? ' primary' : ''}`, text); a.href = href; return a;
};
const size = bytes => bytes >= 1024 ** 2 ? `${(bytes / 1024 ** 2).toFixed(1)} MB` : `${Math.ceil(bytes / 1024)} KB`;
let catalog, current;
function renderMaps() {
  const search = $('search').value.trim().toLowerCase(), sort = $('sort').value;
  const maps = (current?.maps || catalog.maps).filter(m => [m.title, m.artist, m.creator, ...(m.difficulties || [])].join(' ').toLowerCase().includes(search)).sort((a, b) => (a[sort] || '').localeCompare(b[sort] || ''));
  $('count').textContent = `${maps.length} mapset${maps.length === 1 ? '' : 's'}`;
  $('maps').replaceChildren();
  if (!maps.length) {
    const empty = element('div', 'empty');
    empty.append(element('h2', '', search ? 'No matches' : 'No maps'));
    $('maps').append(empty); return;
  }
  maps.forEach((map, i) => {
    const row = element('article', 'map'), info = element('div', 'map-info');
    row.append(element('span', 'map-number', String(i + 1).padStart(2, '0')));
    info.append(element('div', 'map-title', map.title || 'Untitled'));
    info.append(element('div', 'map-sub', [map.artist, map.creator && `mapped by ${map.creator}`].filter(Boolean).join(' · ')));
    const difficulties = map.difficulties || [];
    info.append(element('div', 'map-details', [difficulties.length ? difficulties.join(' / ') : null, map.bytes ? size(map.bytes) : null].filter(Boolean).join(' · ')));
    row.append(info);
    const actions = element('div', 'map-actions');
    if (map.download) actions.append(button('Download .osz', map.download));
    else actions.append(element('span', 'missing', 'Not hosted'));
    if (map.setId > 0) actions.append(button('osu!direct ↗', `osu://dl/${map.setId}`));
    row.append(actions); $('maps').append(row);
  });
}
function route() {
  current = catalog.collections.find(c => `#${c.id}` === location.hash);
  $('title').textContent = current?.name || 'All maps';
  $('description').hidden = !current;
  $('description').textContent = current ? `${current.available} hosted mapsets${current.missing ? ` · ${current.missing} unhosted entries` : ''}` : '';
  $('collection-actions').replaceChildren();
  if (current) {
    const packs = current.packs || (current.pack ? [current.pack] : []);
    packs.forEach((url, i) => $('collection-actions').append(button(packs.length > 1 ? `Download ZIP ${i + 1} of ${packs.length} ↓` : 'Download collection ZIP ↓', url, true)));
    $('collection-actions').append(button('Collection file .osdb', current.collectionDownload));
  }
  for (const a of $('collections').children) { if (a.hash === location.hash || (!current && a.getAttribute('href') === '#')) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); }
  renderMaps();
}
try {
  const response = await fetch('catalog.json'); if (!response.ok) throw new Error('Catalog request failed'); catalog = await response.json();
  document.title = catalog.title; $('collections').replaceChildren();
  for (const c of [{ id: '', name: 'All maps', maps: catalog.maps }, ...catalog.collections]) {
    const a = element('a'); a.href = `#${c.id}`;
    a.append(element('span', '', c.name), element('span', 'badge', c.maps.length)); $('collections').append(a);
  }
  $('search').addEventListener('input', renderMaps); $('sort').addEventListener('change', renderMaps); window.addEventListener('hashchange', route); route();
} catch (error) {
  const box = element('div', 'empty'); box.append(element('h2', 'error', 'Couldn’t load the library'), element('p', '', 'Refresh the page to try again.')); $('maps').replaceChildren(box); console.error(error);
}
