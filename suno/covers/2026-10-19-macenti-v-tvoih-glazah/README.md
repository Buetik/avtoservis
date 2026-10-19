# Обложка: MACENTI — «В твоих глазах»

- `cover-3000x3000.jpg`: основная обложка для стримингов. 3000×3000, RGB, JPG q95.
- `vertical-1080x1920.jpg`: версия для Reels, Stories и Canvas. Текст стоит в безопасной зоне.
- `alternatives/`: две другие концепции из конкурса. A — «Вода и звёзды», C — «Созвездие двоих».

Всё изображение построено процедурно (canvas и SVG с фиксированным сидом), поэтому рендер воспроизводим.
Перерендер (нужны headless Chromium и Python с Pillow):

    src/render-final.sh src/cover.html out/cover            # 3000×3000
    src/render-final.sh src/vertical.html out/vertical 1080 1920

Чтобы поменять текст, в `src/build.py` замени название и имя артиста и запусти `python3 src/build.py`. Скрипт пересоберёт оба HTML.
Шрифты Cormorant Garamond и Manrope (лицензия SIL OFL) лежат в `fonts/`.
