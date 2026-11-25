export function renderHome(main, {bookingConfigured = false} = {}) {
  main.innerHTML = `
    <div class="journal-home">
      <section class="journal-hero" aria-labelledby="home-title">
        <div class="journal-hero-copy">
          <p class="editorial-label">Тактильные интерпретации живописи</p>
          <h1 id="home-title">Другие<br>измерения<br><em>искусства.</em></h1>
          <div class="journal-lead">
            <svg viewBox="0 0 60 60" aria-hidden="true"><path d="M30 5v50M5 30h50M12 12l36 36M12 48l36-36"/></svg>
            <p>Форма, которую можно почувствовать.<br>Изображение, которое можно прочитать по-другому.</p>
          </div>
          <div class="journal-entry"><a class="button" href="#about">О проекте</a><a class="button secondary" href="#access">Вход участника</a></div>
        </div>
        <figure class="journal-cover">
          <img src="assets/editorial/touch.webp" alt="Пальцы касаются рельефного натюрморта. Художественная визуализация тактильного искусства." width="1536" height="1024" fetchpriority="high">
          <figcaption>Художественная визуализация</figcaption>
        </figure>
      </section>
      <section class="journal-statement" aria-labelledby="project-heading">
        <h2 id="project-heading" class="editorial-label">Проект</h2>
        <p>Создаём рельефные версии картин и изучаем, как незрячие и слабовидящие люди воспринимают их на ощупь.</p>
      </section>
      <section class="journal-stories" aria-label="Познакомиться с исследованием">
        <article class="journal-story">
          <p class="editorial-label">Исследование</p>
          <h2>За изображением — новый опыт.</h2>
          <div><p>Сравниваем разные рельефные версии одной картины. Участники описывают, что узнали и как представляют расположение предметов.</p><a class="editorial-link" href="#about">Как устроено исследование</a></div>
        </article>
        <article class="journal-story">
          <p class="editorial-label">Участие</p>
          <h2>Каждый опыт заслуживает внимания.</h2>
          <div><p>Приглашаем незрячих и слабовидящих людей от 18 лет. Встречи проходят очно; отвечать можно текстом или голосом.</p>${!bookingConfigured?'<p class="small muted">Онлайн-запись ещё не открыта.</p>':''}<a class="editorial-link" href="#booking">Участие и запись</a></div>
        </article>
      </section>
    </div>
    <div class="journal-home journal-visit"><div><p class="editorial-label">Место встречи</p><h2>Увидимся на исследовании.</h2></div><div><p>Москва, ул. Вильгельма Пика,<br>4, строение 8.</p><p>Посещение по предварительной записи.</p><a class="editorial-link" href="#visit">Как добраться</a></div></div>`;
}
