MARLETTA FINAL CATALOG

Структура:
- index.html -> каталог + филтри + продуктови карти
- product.html -> детайлна страница за продукт
- js/config.js -> Google Sheets ID и основни настройки
- js/main.js -> каталог, филтри, badges, fallback
- js/product.js -> детайлна продуктова страница
- data/*.csv -> локален fallback, ако Google Sheets не отговори

Google Sheets табове:
- Categories
- Products
- Attributes

Важно:
- spreadsheetId вече е настроен в js/config.js
- ако Google Sheets не зареди, сайтът ще използва local CSV fallback
- не качвайте сайта вътре в допълнителна папка в репото; файловете трябва да са в root
