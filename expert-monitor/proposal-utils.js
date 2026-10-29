'use strict';

// Pure document rendering. The persisted documentKind is authoritative even if
// a linked public record is later removed. No registry, DOM or storage access.
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.ExpertProposalUtils = api;
})(typeof window === 'undefined' ? globalThis : window, function () {
  const DRAFT_NOTICE = 'ПРОЕКТ ДЛЯ ПРОВЕРКИ. НЕ ОТПРАВЛЕН.';
  const KINDS = Object.freeze(['court', 'procurement', 'general']);
  const TITLES = Object.freeze({
    court: 'Информация о возможности проведения экспертизы',
    procurement: 'Предложение о проведении исследования',
    general: 'Коммерческое предложение'
  });
  const REQUIRED_TEXT = Object.freeze({
    court: 'получатель', subject: 'предмет исследования', organization: 'наименование организации',
    expert: 'ФИО эксперта / специалиста', qualification: 'квалификация и опыт',
    requisites: 'реквизиты организации', contact: 'контакт для связи',
    signatory: 'ФИО подписанта', signatoryRole: 'должность подписанта', taxNote: 'налоговый режим и НДС'
  });
  const clean = value => (typeof value === 'string' ? value : typeof value === 'number' && Number.isFinite(value) ? String(value) : '')
    .replace(/\r\n?/g, '\n').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').trim();
  const escapeHtml = value => String(value).replace(/[&<>"']/g,
    char => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[char]));
  const linesHtml = value => escapeHtml(value).replace(/\n/g, '<br>');
  const kindOf = form => KINDS.includes(form?.documentKind) ? form.documentKind : 'general';

  function validDate(value) {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const date = new Date(value + 'T00:00:00.000Z');
    return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
  }

  function validPrice(value) {
    if (!['number', 'string'].includes(typeof value) || !clean(value)) return false;
    const amount = Number(value);
    return Number.isFinite(amount) && amount > 0 && amount <= 1e12
      && Number(amount.toFixed(2)) === amount;
  }

  function validDays(value) {
    if (!['number', 'string'].includes(typeof value) || !clean(value)) return false;
    const days = Number(value);
    return Number.isInteger(days) && days >= 1 && days <= 3650;
  }

  function missingFields(form = {}) {
    const missing = [];
    for (const [key, label] of Object.entries(REQUIRED_TEXT)) if (!clean(form?.[key]))
      missing.push(key === 'court' && kindOf(form) === 'court' ? 'наименование суда' : label);
    if (kindOf(form) !== 'general' && !clean(form?.caseNumber))
      missing.push(kindOf(form) === 'court' ? 'номер дела' : 'номер закупки');
    if (!validPrice(form?.price)) missing.push('стоимость до 1 трлн ₽ с точностью до копеек');
    if (!validDays(form?.days)) missing.push('целый срок от 1 до 3650 дней');
    if (!validDate(form?.documentDate)) missing.push('дата документа');
    if (clean(form?.validUntil) && (!validDate(form.validUntil)
      || validDate(form?.documentDate) && form.validUntil < form.documentDate))
      missing.push('срок действия предложения не раньше даты документа');
    if (form?.documentKind !== undefined && !KINDS.includes(form.documentKind)) missing.push('тип документа');
    if (form?.documentMode !== undefined && !['draft', 'letter'].includes(form.documentMode)) missing.push('режим документа');
    return missing;
  }

  function canExportLetter(form = {}) {
    return missingFields(form).length === 0;
  }

  class IncompleteProposalError extends Error {
    constructor(fields) {
      super('Для оформления письма заполните или исправьте: ' + fields.join(', ') + '.');
      this.name = 'IncompleteProposalError';
      this.fields = [...fields];
    }
  }

  function assertExportable(form) {
    const missing = missingFields(form);
    if (form?.documentMode === 'letter' && missing.length) throw new IncompleteProposalError(missing);
  }

  function dateText(value) {
    return validDate(value) ? value.slice(8, 10) + '.' + value.slice(5, 7) + '.' + value.slice(0, 4) : '[УКАЗАТЬ ДАТУ]';
  }

  function durationText(value) {
    if (!validDays(value)) return '[УКАЗАТЬ ЦЕЛЫЙ СРОК ОТ 1 ДО 3650 ДНЕЙ]';
    const days = Number(value), lastTwo = days % 100, last = days % 10;
    const word = lastTwo >= 11 && lastTwo <= 14 ? 'календарных дней'
      : last === 1 ? 'календарный день' : last >= 2 && last <= 4 ? 'календарных дня' : 'календарных дней';
    return days + ' ' + word;
  }

  function documentModel(form = {}) {
    const field = (key, placeholder) => clean(form?.[key]) || '[' + placeholder + ']';
    const kind = kindOf(form), missing = missingFields(form);
    const draft = form?.documentMode !== 'letter' || missing.length > 0;
    const metadata = clean(form?.documentNumber) ? 'Исх. № ' + clean(form.documentNumber) + ' от ' + dateText(form.documentDate)
      : 'Дата: ' + dateText(form?.documentDate);
    const terms = [
      ['Стоимость', validPrice(form?.price) ? new Intl.NumberFormat('ru-RU', {minimumFractionDigits: 2, maximumFractionDigits: 2}).format(Number(form.price)) + ' ₽' : '[УКАЗАТЬ КОРРЕКТНУЮ СТОИМОСТЬ]'],
      ['Налоговый режим', field('taxNote', 'УКАЗАТЬ НАЛОГОВЫЙ РЕЖИМ И НДС')],
      ['Срок выполнения', durationText(form?.days) + ' после получения полного комплекта материалов и обеспечения доступа к объекту, если требуется осмотр.']
    ];
    if (clean(form?.validUntil)) terms.push(['Предложение действительно до', dateText(form.validUntil)]);
    return {kind, draft, missing, title: TITLES[kind], metadata,
      organization: field('organization', 'ПОЛНОЕ НАИМЕНОВАНИЕ ОРГАНИЗАЦИИ'),
      requisites: field('requisites', 'ИНН / ОГРН / ЮРИДИЧЕСКИЙ АДРЕС'),
      contact: field('contact', 'КОНТАКТ ДЛЯ СВЯЗИ'),
      recipient: (kind === 'court' ? 'В ' : 'Кому: ') + field('court', kind === 'court' ? 'НАИМЕНОВАНИЕ СУДА' : 'НАИМЕНОВАНИЕ ПОЛУЧАТЕЛЯ'),
      reference: kind === 'court' ? 'По делу № ' + field('caseNumber', 'НОМЕР ДЕЛА')
        : kind === 'procurement' ? 'По закупке № ' + field('caseNumber', 'НОМЕР ЗАКУПКИ')
        : clean(form?.caseNumber) ? 'По обращению № ' + clean(form.caseNumber) : '',
      opening: field('organization', 'ПОЛНОЕ НАИМЕНОВАНИЕ ОРГАНИЗАЦИИ') + ' предлагает рассмотреть возможность проведения исследования по вопросу: ' + field('subject', 'ПРЕДМЕТ ИССЛЕДОВАНИЯ') + '.',
      expert: (kind === 'court' ? 'Предлагаемый эксперт: ' : 'Предлагаемый специалист: ') + field('expert', 'ФИО ЭКСПЕРТА / СПЕЦИАЛИСТА') + '.',
      qualification: field('qualification', 'ПОДТВЕРЖДЁННЫЕ СВЕДЕНИЯ О КВАЛИФИКАЦИИ И ОПЫТЕ'),
      terms, conditions: clean(form?.conditions), attachments: clean(form?.attachments),
      signatory: field('signatory', 'ФИО ПОДПИСАНТА'), role: field('signatoryRole', 'ДОЛЖНОСТЬ ПОДПИСАНТА'),
      note: !draft ? '' : kind === 'procurement'
        ? 'Перед участием необходимо проверить извещение, требования и порядок подачи. Это предложение не заменяет заявку по установленной форме.'
        : kind === 'court'
          ? 'Условия проведения экспертизы и состав необходимых материалов подлежат согласованию после изучения поставленных вопросов. Предложение не подтверждает назначение эксперта судом.'
          : 'Состав работ, стоимость и срок подлежат уточнению после ознакомления с исходными материалами.'
    };
  }

  function paragraphs(model) {
    const list = [];
    const add = (text, role = 'body') => {if (text) list.push({text, role});};
    if (model.draft) {
      add(DRAFT_NOTICE, 'draft');
      if (model.missing.length) add('Не заполнено или требует исправления: ' + model.missing.join(', ') + '.', 'note');
    }
    add(model.organization, 'letterhead'); add(model.requisites); add('Контакт: ' + model.contact);
    add(model.metadata, 'meta'); add(model.recipient, 'recipient'); add(model.reference, 'recipient');
    add(model.title, 'title'); add(model.opening); add(model.expert);
    add('Квалификация и профильный опыт', 'heading'); add(model.qualification);
    model.terms.forEach(([label, value]) => add(label + ': ' + value));
    if (model.conditions) {add('Условия и состав работ', 'heading'); add(model.conditions);}
    if (model.attachments) {add('Приложения', 'heading'); add(model.attachments);}
    add(model.role, 'signature-role'); add('____________________ / ' + model.signatory, 'signature');
    add(model.note, 'note');
    return list;
  }

  function proposalText(form = {}) {
    assertExportable(form);
    return paragraphs(documentModel(form)).map(block => block.text).join('\n\n');
  }

  function proposalHtml(form = {}) {
    // A partially edited letter still has a useful preview, explicitly as a draft.
    // Text/RTF export is stricter; printing callers should check canExportLetter.
    const model = documentModel(form);
    const section = (title, body) => `<section><h2>${escapeHtml(title)}</h2><p>${linesHtml(body)}</p></section>`;
    return `<article class="proposal-document" lang="ru" data-document-kind="${model.kind}" data-document-mode="${model.draft ? 'draft' : 'letter'}">`
      + (model.draft ? `<div class="proposal-draft-banner"><strong>${DRAFT_NOTICE}</strong>${model.missing.length ? `<p>Не заполнено или требует исправления: ${escapeHtml(model.missing.join(', '))}.</p>` : ''}</div>` : '')
      + `<header class="proposal-letterhead"><p><strong>${linesHtml(model.organization)}</strong></p><p>${linesHtml(model.requisites)}</p><p>Контакт: ${linesHtml(model.contact)}</p></header>`
      + `<div class="proposal-document-meta">${linesHtml(model.metadata)}</div>`
      + `<section class="proposal-recipient"><p>${linesHtml(model.recipient)}</p>${model.reference ? `<p>${linesHtml(model.reference)}</p>` : ''}</section>`
      + `<h1 class="proposal-title">${escapeHtml(model.title)}</h1><p>${linesHtml(model.opening)}</p><p>${linesHtml(model.expert)}</p>`
      + section('Квалификация и профильный опыт', model.qualification)
      + `<dl class="proposal-terms">${model.terms.map(([label, value]) => `<div><dt>${escapeHtml(label)}</dt><dd>${linesHtml(value)}</dd></div>`).join('')}</dl>`
      + (model.conditions ? section('Условия и состав работ', model.conditions) : '')
      + (model.attachments ? section('Приложения', model.attachments) : '')
      + `<section class="proposal-signature"><p>${linesHtml(model.role)}</p><p class="proposal-signature-line">____________________ / ${linesHtml(model.signatory)}</p></section>`
      + (model.note ? `<p class="proposal-document-note">${linesHtml(model.note)}</p>` : '') + '</article>';
  }

  function escapeRtf(value) {
    let result = '';
    // RTF 1.9.1, Unicode RTF (pp. 14–15): signed UTF-16 values and one fallback
    // byte under \uc1. Braces and backslashes must be control-symbol escaped.
    // https://officeprotocoldoc.z19.web.core.windows.net/files/Archive_References/%5BMSFT-RTF%5D.pdf
    for (let i = 0; i < value.length; i++) {
      const char = value[i], code = value.charCodeAt(i);
      if (char === '\\' || char === '{' || char === '}') result += '\\' + char;
      else if (char === '\n') result += '\\line ';
      else if (char === '\t') result += '\\tab ';
      else if (code >= 32 && code <= 126) result += char;
      else if (code >= 128) result += '\\u' + (code > 32767 ? code - 65536 : code) + '?';
    }
    return result;
  }

  function proposalRtf(form = {}) {
    assertExportable(form);
    const content = paragraphs(documentModel(form)).map(({text, role}) => {
      const formatting = role === 'title' ? '\\qc\\b\\fs28\\keepn '
        : role === 'letterhead' || role === 'draft' ? '\\ql\\b\\fs26\\keepn '
          : role === 'heading' ? '\\ql\\b\\keepn '
            : role === 'recipient' ? '\\qr '
              : role === 'signature-role' ? '\\ql\\keepn '
                : role === 'note' ? '\\ql\\fs20 ' : '\\ql ';
      return '{\\pard\\plain\\f0\\fs24\\lang1049\\widctlpar\\sa140\\sl276\\slmult1'
        + formatting + escapeRtf(text) + '\\par}\n';
    }).join('');
    return '{\\rtf1\\ansi\\ansicpg1251\\deff0\\uc1\n'
      + '{\\fonttbl{\\f0\\froman\\fcharset204 Times New Roman;}}\n'
      + '\\paperw11906\\paperh16838\\margl1134\\margr1134\\margt1020\\margb1134\n'
      + content + '}';
  }

  return Object.freeze({DRAFT_NOTICE, missingFields, canExportLetter, IncompleteProposalError,
    proposalText, proposalHtml, proposalRtf});
});
