# Иллюстрации «ПЕРВОСБОРКА»

Созданы 29.10.2026 встроенным инструментом `image_gen.imagegen` в режиме генерации новых растровых изображений. Исходных референсов не использовалось. Изображения являются авторскими концептуальными иллюстрациями; кампус не воспроизводит реальное здание РГСУ.

## Финальные файлы

| Файл | Размер | Соотношение | Назначение |
|---|---:|---:|---|
| `campus-hero.webp` | 1448 × 1086 | 4:3 | Обложка кампуса |
| `mission-atlas.webp` | 1774 × 887 | 2:1 | Атлас восьми иллюстраций, 4 столбца × 2 строки |

Файлы переупакованы из PNG в WebP, quality=92, method=6. Разрешение, композиция и содержимое не изменялись; обрезка, дорисовка и подмена элементов не выполнялись. Исходные PNG оставлены в каталоге генерации, в публикуемом сайте используются два оптимизированных файла.

## Атлас и CSS

Видимых границ и надписей нет. Все восемь объектов отдельны; каждому соответствует квадратная ячейка атласа. Используйте `background-size: 400% 200%` и квадратный контейнер. Позиции столбцов: `0%, 33.333333%, 66.666667%, 100%`; строки: `0%, 100%`.

| Строка | Столбец | Направление | Объект |
|---:|---:|---|---|
| 1 | 1 | engineering | Кобальтовый кронштейн с рёбрами |
| 1 | 2 | robotics | Мобильный робот |
| 1 | 3 | code | Прозрачные блоки данных |
| 1 | 4 | ai | Сфера связанной сети |
| 2 | 1 | design | Экран и образцы цветов |
| 2 | 2 | xr | VR-очки |
| 2 | 3 | research | Штангенциркуль с цилиндрической деталью |
| 2 | 4 | social | Павильон с пандусами и нейтральными фигурками |

## Исходный промпт: campus-hero

```text
Use case: stylized-concept.
Asset type: premium editorial website hero for an educational technopark exploration experience for ages 12–18.
Create a beautiful sophisticated 3D clay-and-glass rendered open floating technopark island on a very pale ice blue seamless background. A central sculptural stepped cobalt architectural structure is surrounded by a small friendly mobile robot, a compact robotic arm on a workbench, a design display with abstract colored shapes, a laboratory tube, and one elegant sculptural loop. Connect the spaces with accessible gentle ramps and continuous paths.
Composition: landscape 4:3 image, ideally 1536 by 1152 pixels. One coherent isometric three-quarter scene, the entire island and all objects contained inside the central 90 percent of the frame with breathing room on every edge. Crisp legible silhouettes, thoughtful asymmetrical balance. Not an infographic, not a UI screenshot.
Materials: premium matte white ceramic and clay, saturated cobalt blue, restrained navy details, transparent frosted glass, tiny lime green accents. Soft studio daylight, tasteful contact shadows, subtle ambient occlusion, clean bright background, polished architectural editorial quality. Contemporary and inspiring, sophisticated rather than childish.
Constraints: absolutely no text, letters, numbers, typographic symbols, logos, watermarks, people or faces. No dark background, no clutter, no sci-fi weapons, no excessive glowing effects. The object cluster is the subject, every element should feel purposefully designed.
```

## Исходный промпт: mission-atlas

```text
Use case: stylized-concept.
Asset type: a single coherent illustration atlas for eight educational laboratory cards, intended for exact CSS cropping.
Create ONE landscape 2:1 bitmap, ideally 2048 by 1024 pixels. It must contain EXACTLY FOUR equal-width COLUMNS and EXACTLY TWO equal-height ROWS: eight equal square tiles in a perfectly regular 4 by 2 layout. All tile backgrounds have the same very pale ice blue color and blend together seamlessly; NO visible borders, dividers, frames, captions or labels.
Each tile contains ONE centered polished 3D clay/glass object with generous empty margins, all eight objects equally important, at consistent isometric three-quarter camera angle and studio lighting. Each object and its shadow must stay wholly within its own tile. Aim for the object silhouette to occupy 65–75 percent of its tile width and height. No overlapping neighboring tiles. No extra objects between tiles.
EXACT reading order from left to right:
TOP ROW, column 1: a beautifully engineered cobalt blue right-angle bracket with visible structural support ribs.
TOP ROW, column 2: a small friendly white and cobalt mobile robot with wheels and two small sensor lights.
TOP ROW, column 3: transparent stacked code-and-data blocks, a sculptural stack of glass cubes with a few solid cobalt blocks; use pure geometry, absolutely no code characters or text.
TOP ROW, column 4: an elegant chrome and cobalt neural network sphere, a spherical lattice with connected nodes.
BOTTOM ROW, column 1: a bold design display screen with abstract interface shapes and several floating color swatches; no text or numbers.
BOTTOM ROW, column 2: premium white and cobalt VR goggles.
BOTTOM ROW, column 3: a precision caliper measuring a simple cylindrical part, in chrome with a cobalt detail; blank measuring scale with no markings, digits or letters.
BOTTOM ROW, column 4: a compact accessible community pavilion with gentle ramps and two tiny neutral geometric human figurines, inclusive and architectural.
Shared palette: saturated cobalt, white, restrained navy, transparent frosted glass and tiny lime accents. Premium contemporary editorial 3D rendering for ages 12–18, sophisticated rather than childish, soft studio shadows, consistent scale and bright appearance.
Absolute constraints: exactly 8 contained tiles, 4 columns by 2 rows, no typography of any kind, no letters, numbers, logos or watermarks, no title, no tile borders.
```

