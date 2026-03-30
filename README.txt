MARLETTA CATALOG - GOOGLE SHEETS READY

1) За бърз local preview:
- отвори index.html през локален сървър или хостинг
- по подразбиране сайтът чете data/categories.csv, data/products.csv и data/attributes.csv

2) За Google Sheets режим:
- качи файла marletta-catalog-template.xlsx в Google Sheets
- запази имената на листовете:
  Categories
  Products
  Attributes
  Inventory
- отвори js/config.js
- смени:
  mode: "local"
  на:
  mode: "google-sheet"
- попълни spreadsheetId от URL на Google Sheets файла

Примерен URL:
https://docs.google.com/spreadsheets/d/SPREADSHEET_ID/edit#gid=0

3) Важно:
- файлът в Google Sheets трябва да е достъпен за четене
- не сменяй имената на колоните
- site-ът показва само редове с is_active = Да
- stock_qty и stock_status идват от Products
- Products в Excel / Google Sheets дърпа наличност по SKU от Inventory

4) Следващи логични надграждания:
- отделни продуктови страници
- SEO страници по категория
- филтри по характеристики
- PDF каталози
- количка / онлайн магазин