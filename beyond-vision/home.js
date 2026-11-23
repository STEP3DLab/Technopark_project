export function renderHome(main) {
  main.innerHTML = `
    <div class="journal-home">
      <div class="journal-edition"><span>Искусство × восприятие</span><span>Исследуем другие способы знакомства с живописью</span></div>
      <section class="journal-hero" aria-labelledby="home-title">
        <div class="journal-hero-copy">
          <p class="editorial-label">За пределами зрения / Об искусстве и осязании</p>
          <h1 id="home-title">Другие<br>измерения<br><em>искусства.</em></h1>
          <div class="journal-lead">
            <svg viewBox="0 0 60 60" aria-hidden="true"><path d="M30 5v50M5 30h50M12 12l36 36M12 48l36-36"/></svg>
            <p>Форма, которую можно почувствовать.<br>Изображение, которое можно прочитать по-другому.</p>
          </div>
          <div class="journal-entry"><a class="button" href="#booking">Записаться</a><a class="button secondary" href="#access">Пройти опрос</a></div>
        </div>
        <figure class="journal-cover">
          <img src="assets/editorial/touch.webp" alt="Пальцы касаются рельефного натюрморта. Художественная визуализация тактильного искусства." width="1536" height="1024" fetchpriority="high">
          <figcaption><span>В фокусе / Осязание</span><span>Визуальный этюд</span></figcaption>
        </figure>
      </section>
      <section class="journal-statement" aria-labelledby="project-heading">
        <h2 id="project-heading" class="editorial-label">Проект</h2>
        <p>Как изображение становится осязаемой формой? Мы исследуем тактильные интерпретации живописи — распознавание предметов и понимание композиции.</p>
      </section>
      <section class="journal-stories" aria-label="Познакомиться с исследованием">
        <article class="journal-story">
          <p class="editorial-label">Искусство / исследование</p>
          <h2>За изображением — новый опыт.</h2>
          <div><p>Разные способы построения рельефа предлагают разные пути знакомства с картиной. Нас интересует, что помогает понять отдельный предмет и произведение в целом.</p><a class="editorial-link" href="#about">О проекте</a></div>
        </article>
        <article class="journal-story">
          <p class="editorial-label">Участие / диалог</p>
          <h2>Каждый опыт заслуживает внимания.</h2>
          <div><p>Приглашаем незрячих и слабовидящих участников от 18 лет. Встреча проходит с физическими панелями; ответить на вопросы можно текстом или голосом.</p><a class="editorial-link" href="#booking">Об участии и записи</a></div>
        </article>
      </section>
    </div>
    <section class="journal-invitation" aria-labelledby="invitation-title"><div class="journal-invitation-inner">
      <div><p class="editorial-label">Познакомиться с форматом</p><h2 id="invitation-title">Начните с простого вопроса.</h2></div>
      <div><p>До встречи можно попробовать интерфейс опроса: один вопрос, текстовый ответ и знакомство с озвучиванием.</p><p class="invitation-note">Без регистрации и отправки ответа.</p><a class="button" href="#demo">Попробовать опрос</a></div>
    </div></section>
    <div class="journal-home journal-visit"><div><p class="editorial-label">Экспериментальные встречи</p><h2>Увидимся на исследовании.</h2></div><div><p>Москва, улица Вильгельма Пика,<br>4, строение 8.</p><p>Посещение по предварительной записи.</p><a class="editorial-link" href="#visit">Как добраться</a></div></div>`;
}
