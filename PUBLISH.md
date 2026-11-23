# Как залить этот репозиторий на GitHub

Репозиторий уже инициализирован и закоммичен — осталась одна команда.

## Вариант 1: через сайт GitHub + push (рекомендуется)

1. Создайте пустой репозиторий: https://github.com/new
   - Имя: `zadaniya-app` (любое)
   - **Не** добавляйте README, .gitignore и лицензию — они уже есть
2. В папке `zadaniya-app` выполните (замените `USERNAME`):

```bash
git remote add origin https://github.com/USERNAME/zadaniya-app.git
git push -u origin main
```

Если Git попросит пароль — введите **личный токен доступа** (Personal Access Token
с правами `repo`): GitHub → Settings → Developer settings → Personal access tokens.
Пароль от аккаунта больше не принимается.

## Вариант 2: GitHub CLI (если установлен)

```bash
gh auth login
gh repo create zadaniya-app --public --source=. --remote=origin --push
```

## Вариант 3: без командной строки

1. Создайте репозиторий на GitHub.
2. Нажмите «uploading an existing file» и перетащите содержимое папки `zadaniya-app`
   (кроме `.git`).
3. Commit changes.

## После загрузки (по желанию)

- **Скачивание APK прямо из репозитория**: `apk/Zadaniya-1.1.apk` доступен по ссылке
  `https://github.com/USERNAME/zadaniya-app/raw/main/apk/Zadaniya-1.1.apk`.
  На телефоне удобно открывать её и сразу устанавливать.
- **Веб-версия на GitHub Pages**: Settings → Pages → Source: `main`, папка `/web`.
  Приложение откроется по адресу `https://USERNAME.github.io/zadaniya-app/`
  и установится как PWA на главный экран.
- **Релиз**: Releases → «Draft a new release» → тег `v1.1` → прикрепите
  `Zadaniya-1.1.apk` как бинарный файл. Так у вас будет постоянная ссылка на скачивание.
- Замените автора в `LICENSE` и подпись в коммитах:
  `git config user.name "Ваше имя"`, `git config user.email "вы@example.com"`.

## Важно про ключ подписи

`android/keystore.jks` (пароль `zadaniya123`) закоммичен намеренно, чтобы APK собирался
одной командой. Это учебный ключ: для публикации в Google Play создайте свой и
не выкладывайте его в публичный репозиторий.
