# Происхождение поверхности рельефа

В панно использован относительный профиль высот более ранней 3D-модели STEP3DLab «Беларусь в сотах». Паспорт исходной модели указывает Mapzen Terrain Tiles в качестве источника. Исходная 3D-сцена хранит высоты в собственных единицах. Ни абсолютные отметки местности, ни геодезическая точность для нового панно не заявляются.

- [Паспорт исходной модели на зафиксированном коммите](https://github.com/STEP3DLab/Technopark_project/blob/8c0817408f85c4a0e356f2022f566611b4c6c098/belarus-honey-atlas/index.html).
- [Скачать исходный cpu.bin](https://raw.githubusercontent.com/STEP3DLab/Technopark_project/8c0817408f85c4a0e356f2022f566611b4c6c098/belarus-honey-atlas/assets/cpu.bin). Git blob SHA-1: `19fd7b1fb2581a745a5585800bbd349b9af5e6e8`.
- [Mapzen Terrain Tiles, реестр открытых данных AWS](https://registry.opendata.aws/terrain-tiles/).
- [Атрибуция поставщиков высот Mapzen](https://github.com/tilezen/joerd/blob/master/docs/attribution.md). Europe terrain data produced using Copernicus data and information funded by the European Union – EU-DEM layers. Global GMTED2010 and SRTM terrain data courtesy of the U.S. Geological Survey. Global ETOPO1 terrain data: U.S. National Oceanic and Atmospheric Administration.
- [Границы geoBoundaries / CIESIN](https://www.geoboundaries.org/api/current/gbOpen/BLR/ADM1/) · [CC BY 3.0](https://creativecommons.org/licenses/by/3.0/). Границы адаптированы для печати. Минск включён в центральную деталь.

Исходные координаты совмещены с шестью печатными контурами по габаритам областей. Остаточное среднеквадратическое отклонение этих габаритов по осям около 0,4 и 1,8 мм. Для удаления геометрии ячеек взята верхняя огибающая, затем применено сглаживание с σ=2,8 мм в масштабе изделия. Внутри страны перепад нормирован на 12 мм сверх минимальной толщины 4 мм. Для приклейки декора поверхность локально выравнивается на следующем этапе генерации.

Рабочая сетка `terrain_base.npz` содержит координаты `x`, `y` в миллиметрах с шагом 1 мм и `z[y,x]` в миллиметрах над плоским дном. В архиве готовая сетка доступна для автономной пересборки. Для повторного извлечения из предыдущего проекта запустите:

```sh
python derive_relief.py cpu.bin terrain_base.npz
```
