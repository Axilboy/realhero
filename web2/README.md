# Real Hero — клиент v2 (web2)

Полное SPA по **`ТЗ_UI_МОКАПЫ_V2.md`** и паспорту: те же экраны и API, что у корневого `src/`, собирается отдельно.

## Запуск

Корень репозитория:

```bash
npm install
npm run dev:web2
```

- **Web2:** http://127.0.0.1:5174  
- **Классический фронт:** `npm run dev` → http://127.0.0.1:5173  

API: `cd api && npm run dev` (порт 3000).

## Сборка

```bash
npm run build:web2
```

Выход: `web2/dist/`.

## Синхронизация с `src/`

После правок в корневом `src/` при необходимости обновите web2:

```powershell
Copy-Item -Path "src\*" -Destination "web2\src\" -Recurse -Force
```

Или разрабатывайте только в `web2/src/` и переносите в корень, когда v2 стабилен.
