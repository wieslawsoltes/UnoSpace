// Extracts the "## NuGet packages" section of an Uno Space README into structured data:
// intro prose, install command, per-package table descriptions and one entry per
// "### <PackageId>" subsection (summary, install command, key types, usage code and notes).

// Split markdown into paragraph, list, code, heading and table blocks.
function blocks(text) {
  const out = [];
  const lines = text.split('\n');
  for (let i = 0; i < lines.length; ) {
    const line = lines[i];
    const fence = line.match(/^\s*(```+|~~~+)\s*([\w#+-]*)/);
    if (fence) {
      const body = [];
      i++;
      while (i < lines.length && !lines[i].trim().startsWith(fence[1])) body.push(lines[i++]);
      i++;
      out.push({ type: 'code', lang: fence[2] || 'text', code: body.join('\n').replace(/\s+$/, '') });
    } else if (!line.trim()) {
      i++;
    } else if (/^#{1,6}\s/.test(line)) {
      const m = line.match(/^(#+)\s+(.*?)\s*$/);
      out.push({ type: 'heading', level: m[1].length, text: m[2] });
      i++;
    } else if (/^\s*\|/.test(line)) {
      const rows = [];
      while (i < lines.length && /^\s*\|/.test(lines[i])) rows.push(lines[i++]);
      out.push({ type: 'table', rows });
    } else if (/^\s*([-*+]|\d+\.)\s/.test(line)) {
      const items = [];
      while (i < lines.length && lines[i].trim() && !/^\s*(```|~~~)/.test(lines[i])) {
        if (/^\s*([-*+]|\d+\.)\s/.test(lines[i])) items.push(lines[i].replace(/^\s*([-*+]|\d+\.)\s+/, '').trim());
        else if (items.length) items[items.length - 1] += ' ' + lines[i].trim();
        i++;
      }
      out.push({ type: 'list', ordered: /^\s*\d+\./.test(line), items });
    } else {
      const para = [];
      while (i < lines.length && lines[i].trim() && !/^\s*(```|~~~|\||#{1,6}\s)/.test(lines[i]) && !(para.length && /^\s*([-*+]|\d+\.)\s/.test(lines[i]))) para.push(lines[i++].trim());
      out.push({ type: 'paragraph', text: para.join(' ') });
    }
  }
  return out;
}

const cells = (row) => row.trim().replace(/^\||\|$/g, '').split(/(?<!\\)\|/).map((c) => c.trim());
const installOf = (code) => (code.match(/dotnet add package [^\n]+/) || [])[0]?.trim() || '';
const isLabel = (text) => /^\*\*[^*]+\*\*:?$/.test(text.trim());
const label = (text) => text.trim().replace(/^\*\*|\*\*:?$|:$/g, '').replace(/:\s*$/, '').trim();

// Rewrite relative links/images so they point at the repository on GitHub, and drop badge images.
export function absolutize(md, repoUrl) {
  return md
    .replace(/\[!\[[^\]]*\]\([^)]*\)\]\([^)]*\)/g, '')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\]\((?!https?:|mailto:|#)([^)\s]+)\)/g, (_, href) => `](${repoUrl}/blob/main/${href.replace(/^\.\//, '')})`)
    .replace(/\]\(#([^)\s]+)\)/g, (_, anchor) => `](${repoUrl}#${anchor})`);
}

export function parseNugetSection(readme, repoUrl) {
  const start = readme.search(/^## NuGet packages\s*$/m);
  if (start < 0) return null;
  const rest = readme.slice(start).replace(/^.*\n/, '');
  const end = rest.search(/^## /m);
  const section = absolutize(end < 0 ? rest : rest.slice(0, end), repoUrl);

  const [head, ...subs] = section.split(/^(?=### )/m);
  const headBlocks = blocks(head);
  const table = headBlocks.find((b) => b.type === 'table');
  const tableIndex = headBlocks.indexOf(table);
  const descriptions = {};
  if (table) {
    for (const row of table.rows.slice(2)) {
      const c = cells(row);
      const id = (c[0].match(/\[([^\]]+)\]/) || [])[1] || c[0].replace(/`/g, '');
      if (id) descriptions[id] = c[c.length - 1];
    }
  }
  const install = installOf(headBlocks.filter((b) => b.type === 'code').map((b) => b.code).join('\n'));
  const before = tableIndex < 0 ? headBlocks : headBlocks.slice(0, tableIndex);
  const after = tableIndex < 0 ? [] : headBlocks.slice(tableIndex + 1);
  const intro = before.filter((b) => b.type === 'paragraph').map((b) => b.text);
  // Prose and diagrams after the table (dependency chains, threading notes...).
  const notes = after.filter((b) => b.type !== 'code' || !installOf(b.code));

  const packages = subs.map((sub) => {
    const [first, ...body] = sub.split('\n');
    const id = first.replace(/^###\s+/, '').replace(/`/g, '').trim();
    const bs = blocks(body.join('\n'));
    const entry = { id, description: descriptions[id] || '', summary: [], install: '', keyTypes: [], content: [] };
    let pending = null; // bold label waiting for the following block
    for (const b of bs) {
      if (b.type === 'code' && installOf(b.code) && b.code.trim().split('\n').length <= 2 && !entry.install) { entry.install = installOf(b.code); continue; }
      if (b.type === 'paragraph' && isLabel(b.text)) { pending = label(b.text); continue; }
      const kt = b.type === 'paragraph' && b.text.match(/^\*\*Key types\*\*:?\s*(.*)$/i);
      if (kt) { pending = 'Key types'; if (kt[1]) entry.keyTypesNote = kt[1].replace(/^\((.*)\)$/, '$1'); continue; }
      if (b.type === 'list' && (pending === 'Key types' || (!entry.keyTypes.length && /^`/.test(b.items[0] || '') && entry.install))) {
        entry.keyTypes = b.items;
        pending = null;
        continue;
      }
      if (b.type === 'paragraph' && !entry.install && !entry.content.length) { entry.summary.push(b.text); continue; }
      if (pending && pending !== 'Usage' && pending !== 'Key types') entry.content.push({ type: 'label', text: pending });
      pending = null;
      entry.content.push(b.type === 'code' ? { type: 'code', lang: b.lang, code: b.code } : b.type === 'list' ? { type: 'list', ordered: b.ordered, items: b.items } : b.type === 'paragraph' ? { type: 'paragraph', text: b.text } : { type: 'paragraph', text: b.text || '' });
    }
    return entry;
  });
  return { intro, install, notes, packages };
}
