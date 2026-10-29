'use strict';
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) module.exports = factory(require('./workspace-utils.js'));
  else root.ExpertRegistryUtils = factory(root.ExpertWorkspaceUtils);
})(typeof window === 'undefined' ? globalThis : window, function (W) {
  const normalize = value => String(value ?? '').toLocaleLowerCase('ru-RU').replace(/ё/g, 'е');
  const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  function parseSearch(query) {
    const include = [], exclude = [];
    const expression = /(-?)(?:"([^"]*)"|«([^»]*)»|([^\s]+))/g;
    for (const match of String(query ?? '').matchAll(expression)) {
      const term = normalize(match[2] ?? match[3] ?? match[4]).trim();
      if (term) (match[1] ? exclude : include).push(term);
    }
    return {include:[...new Set(include)], exclude:[...new Set(exclude)]};
  }
  function matchesSearch(values, query) {
    const fields = (Array.isArray(values) ? values : [values]).map(normalize);
    const terms = typeof query === 'string' ? parseSearch(query) : query;
    return terms.include.every(term => fields.some(value => value.includes(term)))
      && terms.exclude.every(term => fields.every(value => !value.includes(term)));
  }
  function highlight(value, query) {
    const text = String(value ?? ''), terms = parseSearch(query).include;
    // Keep original UTF-16 offsets even for letters whose lowercase form expands.
    let normalized = ''; const offsets = [];
    for (let i = 0; i < text.length;) {
      const char = String.fromCodePoint(text.codePointAt(i)), folded = normalize(char);
      for (let j = 0; j < folded.length; j++) offsets.push([i, i + char.length]);
      normalized += folded; i += char.length;
    }
    const ranges = [];
    for (const term of terms) {
      for (let at = normalized.indexOf(term); at !== -1; at = normalized.indexOf(term, at + Math.max(term.length, 1)))
        ranges.push([offsets[at][0], offsets[at + term.length - 1][1]]);
    }
    ranges.sort((a,b) => a[0] - b[0] || a[1] - b[1]);
    const merged = [];
    for (const range of ranges) {
      const last = merged.at(-1);
      if (last && range[0] <= last[1]) last[1] = Math.max(last[1], range[1]);
      else merged.push([...range]);
    }
    let result = '', at = 0;
    for (const [start,end] of merged) {result += escapeHtml(text.slice(at,start)) + '<mark class="search-match">' + escapeHtml(text.slice(start,end)) + '</mark>'; at = end;}
    return result + escapeHtml(text.slice(at));
  }
  function validateRange(min, max) {
    const parse = value => {
      if (value === '' || value === undefined || value === null) return null;
      const text = String(value).trim();
      if (!/^\d+(?:[.,]\d{1,2})?$/.test(text)) return NaN;
      const number = Number(text.replace(',', '.'));
      return number <= 1e12 ? number : NaN;
    };
    const low = parse(min), high = parse(max);
    if (Number.isNaN(low) || Number.isNaN(high)) return {valid:false,message:'Укажите сумму от 0 до 1 трлн ₽, не более двух знаков после запятой.'};
    if (low !== null && high !== null && low > high) return {valid:false,message:'Сумма «от» больше суммы «до». Исправьте диапазон.'};
    return {valid:true,min:low,max:high,message:''};
  }
  function paginate(items, page = 1, size = 25) {
    size = [25,50,100].includes(Number(size)) ? Number(size) : 25;
    const total = items.length, pages = Math.max(1, Math.ceil(total / size));
    page = Math.max(1, Math.min(pages, Number.isInteger(Number(page)) ? Number(page) : 1));
    return {items:items.slice((page-1)*size,page*size),page,size,pages,total,start:total?(page-1)*size+1:0,end:Math.min(page*size,total)};
  }
  const groups = [
    ['notes','Заметки'],['work','Рабочие этапы'],['tasks','Задачи'],['checks','Чек-листы'],
    ['drafts','Предложения'],['estimates','Расчёты'],['favorites','Избранное'],['savedFilters','Подборки'],
    ['compareIds','Сравнение'],['profile','Профиль отбора'],['company','Реквизиты']
  ];
  function configuredProfile(profile) {return !!profile && (profile.regions.length > 0 || profile.categories.length > 0 || ['includeWords','excludeWords'].some(key => String(profile[key] || '').split(/[,;\n]+/).some(term=>term.trim())) || ['minBudget','maxBudget'].some(key=>String(profile[key]||'').trim()));}
  function idsFor(workspace, key) {
    if (key === 'profile') return configuredProfile(workspace.profile) ? ['profile'] : [];
    if (key === 'company') return Object.keys(workspace.company).filter(k => workspace.company[k]);
    const value = workspace[key];
    return Array.isArray(value) ? value.map(v => typeof v === 'string' ? v : v.id) : Object.keys(value);
  }
  function workspaceCounts(workspace) {return groups.map(([key,label]) => ({key,label,count:idsFor(workspace,key).length}));}
  function importPreview(current, incoming, replace = false) {
    const left = W.normalizeWorkspace(current), right = W.normalizeWorkspace(incoming);
    if (!left || !right) return null;
    const result = replace ? right : W.mergeWorkspaces(left,right);
    if (!result) return null;
    return groups.map(([key,label]) => {
      const before = idsFor(left,key), imported = idsFor(right,key), after = idsFor(result,key);
      const overlap = imported.filter(id => before.includes(id)).length;
      // Profile and comparison are atomic preferences, not a union of IDs.
      const retained = !replace && key === 'compareIds' && before.length ? imported.length
        : !replace && key === 'profile' && before.length ? imported.length : !replace ? overlap : 0;
      return {key,label,before:before.length,incoming:imported.length,after:after.length,retained};
    });
  }
  return Object.freeze({normalize,parseSearch,matchesSearch,highlight,validateRange,paginate,workspaceCounts,importPreview});
});
