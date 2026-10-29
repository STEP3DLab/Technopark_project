export const PHRASE_GROUPS = [
  ['everyday','На каждый день'], ['study','Учёба'], ['shop','Магазин'], ['travel','Транспорт'], ['service','На приёме'],
];
export const PHRASES = [
  ['everyday','Мне удобнее общаться текстом.'],['everyday','Пожалуйста, напишите ответ здесь.'],
  ['everyday','Я пользуюсь русским жестовым языком.'],['everyday','Подождите, я составляю сообщение.'],
  ['everyday','Повторите, пожалуйста.'],['everyday','Мне нужна помощь.'],['everyday','Спасибо!'],
  ['study','Можно получить задание в письменном виде?'],['study','Покажите, пожалуйста, на примере.'],
  ['study','Где проходит занятие?'],['study','Пришлите, пожалуйста, материалы занятия.'],
  ['study','Я хочу задать вопрос.'],['study','Мне нужно немного больше времени.'],
  ['shop','Сколько это стоит?'],['shop','Можно оплатить картой?'],['shop','Покажите, пожалуйста, другой размер.'],
  ['shop','Где можно забрать заказ?'],['shop','Можно написать итоговую сумму?'],
  ['travel','Подскажите, где нужная остановка?'],['travel','Этот транспорт идёт до моей остановки?'],
  ['travel','Напишите, пожалуйста, время отправления.'],['travel','Покажите маршрут на карте.'],
  ['travel','Сообщите мне, пожалуйста, когда будет моя остановка.'],
  ['service','У меня назначена встреча.'],['service','К кому мне обратиться?'],
  ['service','Какие документы нужно подготовить?'],['service','Напишите, пожалуйста, следующий шаг.'],
  ['service','Мне нужен переводчик русского жестового языка.'],['service','Можно связаться со мной сообщением?'],
].map(([group,text],index)=>({id:`phrase-${index+1}`,group,text}));
const normalize=text=>String(text??'').normalize('NFKC').toLocaleLowerCase('ru').replaceAll('ё','е').trim();
export function findPhrases(group='everyday',query='') {
  const words=normalize(query).split(/\s+/u).filter(Boolean);
  return PHRASES.filter(item=>(words.length || item.group===group) && words.every(word=>normalize(item.text).includes(word)));
}
