# Локальные зависимости распознавания

В приложении используются неизменённые файлы `@mediapipe/tasks-vision` **0.10.21**
и модель **Hand Landmarker float16, версия 1**. Они размещены рядом с приложением,
чтобы камера и загрузка видео не зависели от доступности стороннего CDN при запуске.
Видео пользователя не передаётся поставщику модели.

## Подключение

```js
const { FilesetResolver, HandLandmarker } = await import('./vendor/mediapipe/vision_bundle.mjs');
const fileset = await FilesetResolver.forVisionTasks('./vendor/mediapipe/wasm');
// baseOptions.modelAssetPath: './vendor/models/hand_landmarker.task'
```

Поставляются варианты WebAssembly с SIMD и без SIMD. `FilesetResolver` выбирает
совместимый вариант. В обычном сеансе браузер загружает только один вариант.
Локальная поставка файлов не гарантирует поддержку WebGL или камеры устройством.

## Происхождение и лицензия

Автор MediaPipe — Google LLC и участники проекта MediaPipe. Файлы программы
распространяются по **Apache License 2.0**; оригинальный текст сохранён в
[LICENSE](./LICENSE). Лицензия указана в исходном [package.json](./mediapipe/package.json).

Официальная карточка модели Hand Tracking (Lite/Full), стр. 2, указывает
**Apache License, Version 2.0**. Модель сохраняет лицензию и авторство исходного
проекта; её размещение здесь не означает участия Google в разработке приложения.

- [Исходники MediaPipe, версия 0.10.21](https://github.com/google-ai-edge/mediapipe/tree/v0.10.21).
- [Пакет tasks-vision, версия 0.10.21](https://www.npmjs.com/package/@mediapipe/tasks-vision/v/0.10.21).
- [Официальная модель Hand Landmarker float16/1](https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task).
- [Официальная карточка Hand Tracking, включая лицензию](https://storage.googleapis.com/mediapipe-assets/Model%20Card%20Hand%20Tracking%20%28Lite_Full%29%20with%20Fairness%20Oct%202021.pdf).
- [Документация Hand Landmarker](https://ai.google.dev/edge/mediapipe/solutions/vision/hand_landmarker).

## Проверка и восстановление

В [manifest.json](./manifest.json) зафиксированы точные URL, размеры и SHA-256
каждого исходного файла. Скрипт использует только стандартную библиотеку Python:

```sh
python rsl-nts/scripts/vendor_runtime.py
python rsl-nts/scripts/vendor_runtime.py --download
```

Первая команда проверяет локальные файлы. Вторая восстанавливает отсутствующие
или изменённые файлы по фиксированному списку URL и проверяет их контрольные суммы
перед заменой. Сам список версий и контрольных сумм скрипт не изменяет.
