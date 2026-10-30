export const normalize=value=>String(value??'').toLowerCase().replaceAll('ё','е').replace(/[^\p{L}\p{N}\s]/gu,' ').replace(/\s+/g,' ').trim();
export function findItems(items,{query='',filter='all',favorites=[]}={}){const words=normalize(query).split(' ').filter(Boolean);return items.filter(item=>(filter!=='warm'||item.category==='warm')&&(filter!=='favorites'||favorites.includes(item.id))&&words.every(w=>normalize([item.label,...item.tags].join(' ')).includes(w)));}
export function sanitizeFavorites(value,ids){return Array.isArray(value)?[...new Set(value.filter(x=>typeof x==='string'&&ids.includes(x)))]:[];}
export function readSaved(storage,key,fallback){try{const v=storage.getItem(key);return v===null?fallback:JSON.parse(v);}catch{return fallback;}}
export function save(storage,key,value){try{storage.setItem(key,JSON.stringify(value));return true;}catch{return false;}}
export function stickerFromHash(hash,items){const m=/^#sticker=([a-z0-9_-]+)$/.exec(hash);return m?items.find(i=>i.id===m[1])??null:null;}
export function safeTelegramUrl(value,kind){if(typeof value!=='string')return null;try{const u=new URL(value);if(u.origin!=='https://t.me'||u.search||u.hash)return null;const re=kind==='pack'?/^\/addstickers\/[A-Za-z0-9_]+$/:/^\/[A-Za-z0-9_]+$/;return re.test(u.pathname)?u.href:null;}catch{return null;}}
