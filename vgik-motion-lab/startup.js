// A failed module request must leave a recovery action instead of an endless spinner.
import('./main.js').catch((error) => {
  document.getElementById('loading').hidden = true;
  document.getElementById('stage-error').hidden = false;
  document.getElementById('stage-error-message').textContent = 'Не удалось загрузить файлы студии. Проверьте соединение и повторите загрузку. Сохранённый проект останется в этом браузере.';
  document.getElementById('retry-scene').addEventListener('click', () => location.reload(), { once: true });
  document.getElementById('scene-status').textContent = 'ОШИБКА ЗАГРУЗКИ';
  for (const id of ['demo-button', 'play-button', 'capture-button', 'capture-sequence', 'add-key-button', 'timeline-add-key']) document.getElementById(id).disabled = true;
  console.error('Не удалось загрузить студию:', error);
});
