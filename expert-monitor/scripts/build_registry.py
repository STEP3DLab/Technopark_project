#!/usr/bin/env python3
"""Compile source-backed research. This does not invent current opportunities."""
import argparse
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

def build(research_dir, data_dir, sheet_url=None):
    courts = json.loads((research_dir / "courts.json").read_text(encoding="utf-8"))
    records = json.loads((research_dir / "opportunities.json").read_text(encoding="utf-8"))
    procedure = json.loads((research_dir / "court_procedure.json").read_text(encoding="utf-8"))
    sources = [
      {"id":"moscow-search","name":"Суды Москвы — поиск дел","url":"https://mos-gorsud.ru/search","type":"court_search","status":"manual_required","notes":"Официальный портал 35 районных судов и Мосгорсуда. Поисковая форма требует интерактивной проверки; доступ к отдельным карточкам нестабилен."},
      {"id":"kad","name":"Картотека арбитражных дел","url":"https://kad.arbitr.ru/","type":"court_search","status":"manual_required","notes":"Проверить номер дела, последние определения, кандидатуры экспертов и срок ответа. Публичный запрос не заменяет проверку карточки."},
      {"id":"as-moscow","name":"АС Москвы — официальный сайт","url":"https://msk.arbitr.ru/","type":"court_official","status":"blocked","notes":"При исследовании получен HTTP 403. Наличие страницы в поисковой выдаче не доказывает доступность запроса."},
      {"id":"as-region","name":"АС Московской области — официальный сайт","url":"https://asmo.arbitr.ru/","type":"court_official","status":"blocked","notes":"Ближайший дополнительный контур. Текущий регламент работы с экспертами не удалось прочитать."},
      {"id":"eis","name":"ЕИС — государственные закупки","url":"https://zakupki.gov.ru/epz/order/extendedsearch/results.html","type":"procurement_official","status":"manual_required","notes":"Самостоятельный канал закупок; не все судебные экспертизы являются закупками. Проверить извещение, сроки, требования и обеспечение."},
      {"id":"moscow-data","name":"Открытые данные судов Москвы","url":"https://data.mos-gorsud.ru/","type":"open_data","status":"manual_required","notes":"Официальный портал требует JavaScript; автоматическая выгрузка судебных актов в этой версии не подключена."},
      {"id":"official-directory","name":"Управление Судебного департамента — справочник","url":"https://usd--msk.sudrf.ru/modules.php?name=sud","type":"directory","status":"indexed_official","notes":"Список и публичные служебные контакты получены из индексированного официального справочника. Канал подачи уточняется отдельно."},
      {"id":"kontur","name":"Контур.Закупки — дополнительный поиск","url":"https://zakupki.kontur.ru/","type":"secondary_procurement","status":"secondary","notes":"Источник сигналов и ориентиров. Текущую стадию и документацию подтверждать в ЕИС/на площадке."},
      {"id":"sudact","name":"СудАкт — копии судебных актов","url":"https://sudact.ru/","type":"secondary_decisions","status":"secondary","notes":"Архивный исследовательский источник. Завершённый акт не означает открытый заказ."},
      {"id":"reputation","name":"Reputation — копии судебных актов","url":"https://reputation.su/","type":"secondary_decisions","status":"secondary","notes":"Использованы только доступные части текстов; часть документов ограничена. Первоисточник — карточка суда."}
    ]
    meta = {
      "name":"МСК Эксперт — судебный мониторинг", "schemaVersion":1,
      "asOf":"2026-10-27", "generatedAt":"2026-10-27",
      "sheetUrl":sheet_url,
      "repoUrl":"https://github.com/STEP3DLab/Technopark_project/tree/main/expert-monitor",
      "siteUrl":"https://step3dlab.github.io/Technopark_project/expert-monitor/",
      "scope":"35 районных судов Москвы, Мосгорсуд и основные арбитражные/вышестоящие суды; Московская область — дополнительный контур",
      "researchStatus":"initial_verified_snapshot",
      "company":{"name":"АНО «МСК-Эксперт»","website":"https://sud-mskexpert.ru/","email":"info@sud-mskexpert.ru","phone":"+7 (495) 648-50-91","sourceUrl":"https://sud-mskexpert.ru/","checkedAt":"2026-10-27"},
      "limitations":[
        "Справочник судов полный для выбранного контура; полнота найденных судебных актов не подтверждена.",
        "Открытых судебных запросов, подтверждённых первоисточником в ходе текущего поиска, не найдено. Это не означает отсутствия таких запросов.",
        "Судебные записи прочитаны в доступных вторичных копиях. Действующую стадию и сроки необходимо сверить в карточке суда.",
        "Смежная закупка с будущим сроком — объект в Карелии, московский заказчик; она не является судебным заказом.",
        "Неизвестная цена оставлена пустой. НМЦК, цена договора, гонорар эксперта и сумма иска показаны отдельно.",
        "Черновики КП, заметки и собственные цены хранятся в вашем браузере; они не синхронизируются с Google Таблицей и не отправляются в суд.",
        "Данные обновляются с задержкой: GitHub Actions проверяет доступность и профильные ссылки, отдельный исследовательский мониторинг проверяет найденные записи. Это не прямой поток из судебных систем."
      ],
      "automation":{"sourceCheck":"hourly","browserRefreshSeconds":60,"researchTaskStatus":"not_configured","sendingEnabled":False},
      "coverage":{"districtCourts":35,"courtDirectory":len(courts),"records":len(records),"openedContactPages":6}
    }
    if (data_dir / "registry.json").exists():
        old = json.loads((data_dir / "registry.json").read_text(encoding="utf-8"))
        for key in ("sheetUrl","automation"):
            if old.get("meta",{}).get(key) and (key != "sheetUrl" or not sheet_url): meta[key] = old["meta"][key]
    registry = {"meta":meta,"courts":courts,"opportunities":records,"sources":sources,"procedure":procedure}
    data_dir.mkdir(parents=True, exist_ok=True)
    (data_dir / "registry.json").write_text(json.dumps(registry, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    config = []
    for source in sources:
        auto = source["id"] in ("moscow-search", "as-moscow", "as-region", "official-directory")
        config.append({**source,"autoFetch":auto,"extractLinks":source["id"] in ("moscow-search","as-moscow","as-region")})
    (data_dir / "source-config.json").write_text(json.dumps(config, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    (data_dir / "procedure.json").write_text(json.dumps(procedure, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Compiled: {len(courts)} courts, {len(records)} records, {len(sources)} source systems")

if __name__ == "__main__":
    parser=argparse.ArgumentParser()
    parser.add_argument("--research-dir",type=Path,default=ROOT / "research")
    parser.add_argument("--data-dir",type=Path,required=True)
    parser.add_argument("--sheet-url")
    args=parser.parse_args()
    build(args.research_dir,args.data_dir,args.sheet_url)
