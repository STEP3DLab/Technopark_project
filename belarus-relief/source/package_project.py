"""Build the production ZIP, printable region ZIP and public download catalog."""
from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED
import json

root = Path(__file__).resolve().parents[1]
downloads = root/'downloads'
downloads.mkdir(exist_ok=True)

def freeze(output, files):
    with ZipFile(output,'w',compression=ZIP_DEFLATED,compresslevel=6) as z:
        for path in sorted(set(files)):
            z.write(path, path.relative_to(root))

regions = json.loads((root/'data/terrain.json').read_text())['regions']
files = []
def entry(group, title, path, detail):
    files.append({'group':group,'title':title,'path':path,'type':Path(path).suffix[1:].upper(),'detail':detail})

entry('Комплекты','Комплект для мастерской','downloads/belarus-production.zip','Модели, чертежи, смета и исходники')
entry('Комплекты','Шесть областей для FDM','downloads/regions-stl.zip','Шесть STL в общей системе координат, мм')
entry('Сборка','Собранное панно','models/panel.glb','Цветная сборка для просмотра и импорта в Blender')
entry('Печать','Раскладка всего мелкого декора','models/decor-plate.3mf','13 деталей, поле от 115 × 75 мм')
entry('Документы','Маршрутная карта мастерской','print/workbook.pdf','7 страниц · спецификация и восемь операций')
entry('Документы','Смета и спецификация','downloads/specification.xlsx','Три листа · расход, закупка, работа и состав')
entry('Шаблоны','Монтаж на обычном принтере','templates/assembly-a4.pdf','Четыре листа A4 с перекрытием, масштаб 1:1')
entry('Шаблоны','Монтажный мастер','templates/assembly-1to1.pdf','Один лист 460 × 430 мм, масштаб 1:1')
entry('Шаблоны','Векторный монтажный шаблон','templates/assembly-1to1.svg','Контурная разметка задника и областей в мм')
entry('Шаблоны','Рама и четверть','print/frame.pdf','Габариты, запилы и размеры посадки')
entry('Шаблоны','Разметка городов и звёзд','print/decor-placement.pdf','Четыре листа A4, масштаб 1:1')
entry('Шаблоны','Вектор размещения декора','print/decor-placement.svg','Редактируемая схема в миллиметрах')
entry('Шаблоны','Цветочная лента','print/sash-1to1.pdf','Один лист A3, контрольная шкала 50 мм')
entry('Шаблоны','Исходник орнамента','print/sash.svg','Редактируемые цветные контуры')
for r in regions:
    dims=' × '.join(('%0.1f'%v).replace('.',',') for v in r['dimensions_mm'])
    entry('Печать',r['name'],r['path'],dims+' мм · 1 деталь')
entry('Печать','Зубр','models/bison/bison.stl','57,49 × 32,46 × 6,20 мм · 1 деталь')
for sz,qty in [(12,4),(14,1),(17,1)]:
    entry('Печать','Рубиновая звезда '+str(sz)+' мм',f'models/decor/star-{sz}mm.stl',f'На панно — {qty} шт.')
for p in json.loads((root/'data/decor.json').read_text())['parts']:
    if p['kind']=='label':
        entry('Печать','Надпись «'+p['name']+'»',p['file'],'Одно слово с подложкой · 1 шт.')
(root/'data/files.json').write_text(json.dumps(files,ensure_ascii=False,indent=2)+'\n')
freeze(downloads/'regions-stl.zip',[root/r['path'] for r in regions])
items=[root/'README.md',root/'assets/approved.webp',downloads/'specification.xlsx']
for folder in ('models','templates','print','source','data'):
    items.extend(p for p in (root/folder).rglob('*') if p.is_file() and '__pycache__' not in p.parts and not p.name.startswith('.') and p.name not in ('files.json','package_project.py','panel-cpu.glb'))
freeze(downloads/'belarus-production.zip',items)
print(len(items),'production entries,',len(files),'catalog downloads')
