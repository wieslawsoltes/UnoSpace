// Tiny build-time syntax highlighter for C#, shell, JSON and XML snippets.
export const esc = (s = '') => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const CS_KW = new Set('abstract as async await base bool break byte case catch char checked class const continue decimal default delegate do double else enum event explicit extern false finally fixed float for foreach get goto if implicit in init int interface internal is lock long namespace new null object operator out override params private protected public readonly record ref return sbyte sealed set short sizeof stackalloc static string struct switch this throw true try typeof uint ulong unchecked unsafe ushort using var virtual void volatile when where while with yield'.split(' '));
const SH_KW = new Set('export cd if then fi for do done in echo set npm npx dotnet python3 docker git node'.split(' '));

const RULES = {
  csharp: [
    ['com', /\/\/[^\n]*|\/\*[\s\S]*?\*\//y],
    ['str', /\$?@?"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)'/y],
    ['num', /\b\d+(?:\.\d+)?[fdmlu]?\b/y],
    ['id', /[A-Za-z_][\w]*/y],
  ],
  bash: [
    ['com', /#[^\n]*/y],
    ['str', /"(?:[^"\\]|\\.)*"|'[^']*'/y],
    ['var', /\$\(?[\w{}]+\)?/y],
    ['flag', /(?<=\s)--?[\w-]+(?:=[^\s]*)?/y],
    ['id', /[A-Za-z_][\w.-]*/y],
  ],
  json: [
    ['key', /"(?:[^"\\]|\\.)*"(?=\s*:)/y],
    ['str', /"(?:[^"\\]|\\.)*"/y],
    ['num', /-?\b\d+(?:\.\d+)?\b/y],
    ['kw', /\b(?:true|false|null)\b/y],
  ],
  xml: [
    ['com', /<!--[\s\S]*?-->/y],
    ['tag', /<\/?[\w.:-]+|\/?>/y],
    ['key', /[\w.:-]+(?==)/y],
    ['str', /"[^"]*"/y],
  ],
};

export function highlight(code, lang = 'csharp') {
  const l = /^(cs|c#|csharp)$/i.test(lang) ? 'csharp' : /^(sh|bash|shell|zsh|pwsh|powershell|console)$/i.test(lang) ? 'bash' : /^json/i.test(lang) ? 'json' : /^(xml|xaml|html)$/i.test(lang) ? 'xml' : null;
  if (!l) return esc(code);
  const rules = RULES[l];
  let out = '';
  let i = 0;
  let plain = '';
  let lineStart = true;
  const flush = () => { if (plain) { out += esc(plain); plain = ''; } };
  outer: while (i < code.length) {
    for (const [cls, re] of rules) {
      re.lastIndex = i;
      const m = re.exec(code);
      if (m && m.index === i && m[0].length) {
        let k = cls;
        const t = m[0];
        if (cls === 'id') {
          if (l === 'csharp') k = CS_KW.has(t) ? 'kw' : /^[A-Z]/.test(t) ? (code[i + t.length] === '(' ? 'fn' : 'type') : code[i + t.length] === '(' ? 'fn' : '';
          else k = lineStart && SH_KW.has(t) ? 'kw' : lineStart ? 'fn' : '';
        }
        flush();
        out += k ? `<span class="t-${k}">${esc(t)}</span>` : esc(t);
        if (!/^\s*$/.test(t)) lineStart = false;
        i += t.length;
        continue outer;
      }
    }
    const ch = code[i];
    if (ch === '\n') lineStart = true;
    else if (!/\s|\\/.test(ch) && l === 'bash' && ch !== '|' && ch !== '&') lineStart = false;
    if (l === 'bash' && (ch === '|' || ch === '&')) lineStart = true;
    plain += ch;
    i++;
  }
  flush();
  return out;
}
