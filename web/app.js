/* ================= Дневник заданий — логика ================= */
(function () {
  'use strict';

  const STORE_KEY = 'study-planner.v1';
  const RU_MONTHS = ['январь', 'февраль', 'март', 'апрель', 'май', 'июнь', 'июль', 'август', 'сентябрь', 'октябрь', 'ноябрь', 'декабрь'];
  const RU_MONTHS_GEN = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
  const RU_WEEK = ['воскресенье', 'понедельник', 'вторник', 'среда', 'четверг', 'пятница', 'суббота'];
  const WEEK_SHORT = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];
  const PRIORITY_LABEL = { low: 'низкая', mid: 'средняя', high: 'высокая' };
  const PRIORITY_WEIGHT = { high: 0, mid: 1, low: 2 };
  const ICON_URL = 'icon-192.png';
  // Нативная оболочка Android (WebView) — настоящие системные напоминания
  const NATIVE = !!(window.NativeApp && (function () { try { return window.NativeApp.isNative(); } catch (e) { return false; } })());
  const nativeSchedule = () => {
    if (!NATIVE) return;
    try { window.NativeApp.scheduleReminders(JSON.stringify(state)); } catch (e) { }
  };
  const DEFAULT_SUBJECTS = ['Математика', 'Русский язык', 'Литература', 'История', 'Физика', 'Химия', 'Биология', 'Английский язык', 'Информатика', 'Обществознание'];

  /* ---------- helpers ---------- */
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const pad = n => String(n).padStart(2, '0');
  const iso = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const fromIso = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
  const todayIso = () => iso(new Date());
  const startOfDay = d => new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const dayDiff = (a, b) => Math.round((startOfDay(a) - startOfDay(b)) / 86400000);
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  const esc = str => String(str == null ? '' : str).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const norm = s => String(s || '').trim().toLowerCase().replace(/\s+/g, ' ');

  function plural(n, one, few, many) {
    const n10 = n % 10, n100 = n % 100;
    if (n10 === 1 && n100 !== 11) return one;
    if (n10 >= 2 && n10 <= 4 && (n100 < 10 || n100 >= 20)) return few;
    return many;
  }

  function humanDate(isoStr) {
    const d = fromIso(isoStr);
    const diff = dayDiff(d, new Date());
    const base = `${d.getDate()} ${RU_MONTHS_GEN[d.getMonth()]}`;
    const withYear = d.getFullYear() === new Date().getFullYear() ? base : `${base} ${d.getFullYear()}`;
    if (diff === 0) return 'сегодня';
    if (diff === 1) return 'завтра';
    if (diff === -1) return 'вчера';
    return withYear;
  }

  /* ---------- недели: синяя / красная ---------- */
  // Понедельник недели, содержащей дату
  function mondayOf(d) {
    const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    const shift = (x.getDay() + 6) % 7; // пн = 0
    x.setDate(x.getDate() - shift);
    return x;
  }
  const WEEK_TYPE_NAME = { blue: 'Синяя неделя', red: 'Красная неделя' };

  // Цвет недели, в которую попадает дата (чередование по чётности недель от опорной)
  function weekTypeFor(date) {
    const anchor = fromIso(state.settings.weekAnchor || todayIso());
    const anchorMonday = mondayOf(anchor);
    const target = mondayOf(date);
    const weeks = Math.round((target - anchorMonday) / (7 * 86400000));
    const anchorType = state.settings.weekType === 'red' ? 'red' : 'blue';
    const other = anchorType === 'blue' ? 'red' : 'blue';
    return ((weeks % 2) + 2) % 2 === 0 ? anchorType : other;
  }
  function currentWeekType() { return weekTypeFor(new Date()); }
  function weekTypeByIndex(index) {
    const anchor = fromIso(state.settings.weekAnchor || todayIso());
    const monday = new Date(mondayOf(anchor).getTime() + index * 7 * 86400000);
    return weekTypeFor(monday);
  }
  // урок показывается в неделе, если он общий или совпадает по цвету
  function lessonFitsWeek(lesson, weekType) {
    const w = lesson.week || 'both';
    return w === 'both' || w === weekType;
  }
  // смещение недели (0 = текущая, 1 = следующая, -1 = прошлая), у которой нужный цвет
  function offsetForType(target) {
    for (const off of [0, 1, -1]) if (weekTypeByIndex(off) === target) return off;
    return 0;
  }
  function fmtRange(from, to) {
    const m1 = RU_MONTHS_GEN[from.getMonth()].slice(0, 3);
    const m2 = RU_MONTHS_GEN[to.getMonth()].slice(0, 3);
    return `${from.getDate()} ${m1} — ${to.getDate()} ${m2}`;
  }

  /* ---------- state ---------- */
  const memStore = {};
  const store = {
    get(k) { try { return localStorage.getItem(k); } catch (e) { return memStore[k] ?? null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch (e) { memStore[k] = v; } }
  };

  function defaults() {
    return {
      tasks: [],
      subjects: DEFAULT_SUBJECTS.slice(),
      lessons: [],
      settings: { notify: false, time: '09:00', before: 1, weekType: 'blue', weekAnchor: iso(mondayOf(new Date())) },
      notified: {},
      seeded: false
    };
  }

  function load() {
    const base = defaults();
    try {
      const raw = store.get(STORE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && Array.isArray(parsed.tasks)) {
          return {
            tasks: parsed.tasks,
            subjects: Array.isArray(parsed.subjects) && parsed.subjects.length ? parsed.subjects : base.subjects,
            lessons: Array.isArray(parsed.lessons) ? parsed.lessons : [],
            settings: Object.assign({}, base.settings, parsed.settings || {}),
            notified: parsed.notified && typeof parsed.notified === 'object' ? parsed.notified : {},
            seeded: !!parsed.seeded
          };
        }
      }
    } catch (e) { /* ignore broken storage */ }
    return base;
  }

  // при первом запуске в приложении подтягиваем данные, сохранённые нативно
  if (NATIVE) {
    try {
      const native = window.NativeApp.loadState();
      if (native && !store.get(STORE_KEY)) store.set(STORE_KEY, native);
    } catch (e) { }
  }

  let state = load();
  let ui = {
    view: 'home', filter: 'all', subject: null, search: '',
    calMonth: new Date().getMonth(), calYear: new Date().getFullYear(), selectedDay: todayIso(),
    editingId: null, priority: 'mid',
    schedDay: new Date().getDay(), schedWeekOffset: 0, lessonId: null, lessonDay: new Date().getDay(), lessonWeek: 'both'
  };

  function save() {
    store.set(STORE_KEY, JSON.stringify(state));
    if (NATIVE) {
      const json = JSON.stringify(state);
      try { window.NativeApp.saveState(json); } catch (e) { }
      nativeSchedule();
    }
  }

  /* ---------- демо-данные при первом запуске ---------- */
  function seedIfNeeded() {
    if (state.tasks.length || state.seeded) return;
    state.seeded = true;
    const t = new Date();
    const add = (days, title, subject, priority, notes) => {
      const d = new Date(t.getFullYear(), t.getMonth(), t.getDate() + days);
      state.tasks.push({ id: uid(), title, subject, priority, notes: notes || '', date: iso(d), done: false, created: Date.now() });
    };
    const lesson = (day, start, end, subject, room, week) => {
      state.lessons.push({ id: uid(), day, start, end, subject, room, week: week || 'both' });
    };
    // расписание-пример: часть уроков — каждую неделю, часть — только по синей/красной
    lesson(1, '09:00', '09:45', 'Математика', '204', 'both');
    lesson(2, '10:00', '10:45', 'Русский язык', '112', 'both');
    lesson(3, '09:00', '09:45', 'Физика', '301', 'blue');
    lesson(3, '09:00', '09:45', 'Химия', '305', 'red');
    lesson(4, '11:00', '11:45', 'Английский язык', '208', 'both');
    lesson(5, '10:00', '10:45', 'Литература', '105', 'both');
    add(2, 'Параграф 14, задачи 3–7', 'Математика', 'high', 'Повторить формулы площади — они понадобятся на контрольной.');
    add(4, 'Сочинение «Мой любимый герой»', 'Литература', 'mid', 'Минимум 1,5 страницы, привести 2 цитаты.');
    add(7, 'Unit 5: слова + упражнение 4', 'Английский язык', 'low', '');
    save();
  }

  /* ---------- выборки ---------- */
  function visibleTasks() {
    const q = ui.search.trim().toLowerCase();
    let list = state.tasks.slice();
    if (ui.filter === 'active') list = list.filter(t => !t.done);
    if (ui.filter === 'done') list = list.filter(t => t.done);
    if (ui.filter === 'overdue') list = list.filter(t => !t.done && t.date < todayIso());
    if (ui.subject) list = list.filter(t => norm(t.subject) === norm(ui.subject));
    if (q) list = list.filter(t => (t.title + ' ' + (t.notes || '') + ' ' + (t.subject || '')).toLowerCase().includes(q));
    list.sort((a, b) => {
      if (a.done !== b.done) return a.done ? 1 : -1;
      if (a.date !== b.date) return a.date < b.date ? -1 : 1;
      return PRIORITY_WEIGHT[a.priority] - PRIORITY_WEIGHT[b.priority];
    });
    return list;
  }

  function tasksForDay(isoStr) {
    return state.tasks.filter(t => t.date === isoStr).sort((a, b) => {
      if (a.done !== b.done) return a.done ? 1 : -1;
      return PRIORITY_WEIGHT[a.priority] - PRIORITY_WEIGHT[b.priority];
    });
  }

  function tasksForSubject(subject) {
    return state.tasks
      .filter(t => norm(t.subject) === norm(subject))
      .sort((a, b) => {
        if (a.done !== b.done) return a.done ? 1 : -1;
        if (a.date !== b.date) return a.date < b.date ? -1 : 1;
        return PRIORITY_WEIGHT[a.priority] - PRIORITY_WEIGHT[b.priority];
      });
  }

  function lessonsForDay(day, weekType) {
    const wt = weekType || weekTypeByIndex(ui.schedWeekOffset);
    return state.lessons
      .filter(l => Number(l.day) === Number(day) && lessonFitsWeek(l, wt))
      .sort((a, b) => (a.start || '').localeCompare(b.start || ''));
  }

  function allSubjects() {
    const used = state.tasks.map(t => (t.subject || '').trim()).filter(Boolean)
      .concat(state.lessons.map(l => (l.subject || '').trim()).filter(Boolean));
    return Array.from(new Set([...used, ...state.subjects])).sort((a, b) => a.localeCompare(b, 'ru'));
  }

  /* ---------- карточка задания ---------- */
  function taskCard(t) {
    const overdue = !t.done && t.date < todayIso();
    const isToday = t.date === todayIso();
    const soon = !t.done && !overdue && !isToday && dayDiff(fromIso(t.date), new Date()) <= 2;
    const dateBadge = overdue ? '<span class="badge overdue">просрочено</span>'
      : isToday ? '<span class="badge today">сегодня</span>'
        : soon ? `<span class="badge soon">${humanDate(t.date)}</span>` : '';
    const notes = (t.notes || '').trim();
    return `
      <article class="task ${t.done ? 'done' : ''}" data-priority="${esc(t.priority || 'mid')}" data-id="${t.id}">
        <button class="check" data-action="toggle" aria-label="${t.done ? 'Отметить невыполненным' : 'Отметить выполненным'}">
          <svg viewBox="0 0 24 24" fill="none"><path d="m5 12.5 4.5 4.5L19 7" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </button>
        <div class="task-body" data-action="edit">
          <div class="task-top">
            ${t.subject ? `<button type="button" class="subject-tag" data-action="subject" data-subject="${esc(t.subject)}">${esc(t.subject)}</button>` : '<span class="subject-tag">без предмета</span>'}
            ${dateBadge}
          </div>
          <p class="task-title">${esc(t.title)}</p>
          <div class="task-meta">
            <span class="task-date">
              <svg viewBox="0 0 24 24" fill="none"><rect x="4" y="5" width="16" height="15" rx="3" stroke="currentColor" stroke-width="1.8"/><path d="M8 3v4M16 3v4M4 10h16" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>
              ${esc(humanDate(t.date))}
            </span>
            <span>${PRIORITY_LABEL[t.priority || 'mid']} важность</span>
          </div>
          ${notes ? `<div class="task-notes clamped">${esc(notes)}</div>` : ''}
        </div>
        <button class="task-edit" data-action="edit" aria-label="Изменить задание">
          <svg viewBox="0 0 24 24" fill="none"><path d="M4 20h4l10.5-10.5a2.1 2.1 0 0 0-3-3L5 17v3Z" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/><path d="m14 6 3 3" stroke="currentColor" stroke-width="1.7"/></svg>
        </button>
      </article>`;
  }

  /* ---------- главный экран ---------- */
  function renderHome() {
    const all = state.tasks;
    const today = todayIso();
    const weekEnd = iso(new Date(Date.now() + 7 * 86400000));
    $('#statOverdue').textContent = all.filter(t => !t.done && t.date < today).length;
    $('#statWeek').textContent = all.filter(t => !t.done && t.date >= today && t.date <= weekEnd).length;
    $('#statDone').textContent = all.filter(t => t.done).length;

    const list = visibleTasks();
    const el = $('#taskList');
    const empty = $('#emptyState');
    $('#listCount').textContent = list.length ? `${list.length} ${plural(list.length, 'задание', 'задания', 'заданий')}` : '';

    const titles = { all: 'Все задания', active: 'Активные задания', overdue: 'Просроченные', done: 'Выполненные' };
    $('#listTitle').textContent = ui.subject ? `Предмет: ${ui.subject}` : (ui.search.trim() ? 'Результаты поиска' : titles[ui.filter]);

    $('#filterChips').querySelectorAll('.chip').forEach(c => {
      if (c.classList.contains('chip-subject')) return;
      c.classList.toggle('active', !ui.subject && c.dataset.filter === ui.filter);
    });
    const chip = $('#subjectChip');
    if (ui.subject) { chip.hidden = false; chip.textContent = `× ${ui.subject}`; } else { chip.hidden = true; }
    const chipsEl = $('#filterChips');
    if (!ui.subject && !ui.search.trim()) chipsEl.scrollLeft = 0;

    if (!list.length) {
      el.innerHTML = '';
      empty.hidden = false;
      const hasAny = all.length > 0;
      $('#emptyTitle').textContent = hasAny ? 'Ничего не найдено' : 'Пока пусто';
      $('#emptyText').textContent = hasAny
        ? 'Попробуйте изменить фильтр, предмет или поисковый запрос.'
        : 'Нажмите «+», чтобы добавить первое задание с дедлайном.';
      return;
    }
    empty.hidden = true;

    if (ui.filter === 'done' || ui.filter === 'overdue' || ui.search.trim()) {
      el.innerHTML = list.map(taskCard).join('');
      return;
    }

    const todayStr = todayIso();
    const bucket = t => t.done ? 3 : (t.date < todayStr ? 0 : t.date === todayStr ? 1 : 2);
    const ordered = list.slice().sort((a, b) => {
      const ba = bucket(a), bb = bucket(b);
      if (ba !== bb) return ba - bb;
      if (a.date !== b.date) return a.date < b.date ? -1 : 1;
      return PRIORITY_WEIGHT[a.priority] - PRIORITY_WEIGHT[b.priority];
    });
    const groups = new Map();
    ordered.forEach(t => { if (!groups.has(t.date)) groups.set(t.date, []); groups.get(t.date).push(t); });
    el.innerHTML = Array.from(groups.entries()).map(([date, items]) => `
      <div class="day-group">
        <div class="list-head" style="margin:14px 2px 8px">
          <h2>${esc(humanDate(date))}</h2>
          <span class="count">${items.length} ${plural(items.length, 'задание', 'задания', 'заданий')}</span>
        </div>
        ${items.map(taskCard).join('')}
      </div>`).join('');
  }

  /* ---------- расписание ---------- */
  function renderSchedule() {
    const weekType = weekTypeByIndex(ui.schedWeekOffset);
    const isCurrentWeek = ui.schedWeekOffset === 0;
    const today = new Date();
    const monday = new Date(mondayOf(today).getTime() + ui.schedWeekOffset * 7 * 86400000);
    const sunday = new Date(monday.getTime() + 6 * 86400000);

    // переключатель недели
    $$('#weekSwitch button').forEach(b => b.classList.toggle('active', b.dataset.week === weekType));
    $('#weekRange').innerHTML =
      `<b>${WEEK_TYPE_NAME[weekType]}</b> · ${fmtRange(monday, sunday)}${isCurrentWeek ? '<span class="now-tag">эта неделя</span>' : ''}`;

    // дни недели
    $('#dayChips').innerHTML = [1, 2, 3, 4, 5, 6, 0].map(d => {
      const date = new Date(monday.getTime() + ((d + 6) % 7) * 86400000);
      const isToday = ui.schedWeekOffset === 0 && today.getDay() === d;
      return `<button class="chip day-chip ${Number(ui.schedDay) === d ? 'active' : ''} ${isToday ? 'today-day' : ''}" data-day="${d}">
        <b>${WEEK_SHORT[d]}</b><span>${date.getDate()} ${RU_MONTHS_GEN[date.getMonth()].slice(0, 3)}</span>
      </button>`;
    }).join('');

    const day = Number(ui.schedDay);
    const lessons = lessonsForDay(day, weekType);
    const isToday = isCurrentWeek && today.getDay() === day;
    $('#scheduleTitle').textContent = isToday ? `Сегодня, ${RU_WEEK[day]}` : (RU_WEEK[day].charAt(0).toUpperCase() + RU_WEEK[day].slice(1));
    const totalTasks = lessons.reduce((n, l) => n + tasksForSubject(l.subject).filter(t => !t.done).length, 0);
    $('#scheduleSub').textContent = lessons.length
      ? `${lessons.length} ${plural(lessons.length, 'урок', 'урока', 'уроков')}${totalTasks ? ` · ${totalTasks} ${plural(totalTasks, 'задание', 'задания', 'заданий')} по этим предметам` : ''}`
      : `Уроков нет · ${weekType === 'blue' ? 'синяя' : 'красная'} неделя`;

    const list = $('#lessonList');
    if (!lessons.length) {
      const otherType = weekType === 'blue' ? 'red' : 'blue';
      const otherCount = state.lessons.filter(l => Number(l.day) === day && lessonFitsWeek(l, otherType)).length;
      list.innerHTML = `<div class="schedule-empty">
        <svg viewBox="0 0 24 24" fill="none"><rect x="4" y="5" width="16" height="15" rx="3" stroke="currentColor" stroke-width="1.5"/><path d="M8 3v4M16 3v4M4 10h16" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><path d="M12 13v4M10 15h4" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>
        <p class="empty-title">Свободный день</p>
        <p class="empty-text">${otherCount
          ? `В ${otherType === 'blue' ? 'синюю' : 'красную'} неделю здесь ${otherCount} ${plural(otherCount, 'урок', 'урока', 'уроков')} — переключите неделю сверху.`
          : 'Нажмите «+ урок», чтобы добавить предмет в расписание.'}</p>
      </div>`;
      return;
    }

    const nowMin = today.getHours() * 60 + today.getMinutes();
    const mins = s => { const [h, m] = String(s || '0:0').split(':').map(Number); return h * 60 + (m || 0); };

    list.innerHTML = lessons.map(l => {
      const related = tasksForSubject(l.subject);
      const undone = related.filter(t => !t.done);
      const started = mins(l.start), ended = l.end ? mins(l.end) : started + 45;
      const running = isToday && nowMin >= started && nowMin <= ended;
      const weekMark = (l.week === 'blue' || l.week === 'red')
        ? `<span class="week-mark ${l.week}">${l.week === 'blue' ? 'синяя' : 'красная'}</span>` : '';

      const tasksHtml = undone.length
        ? undone.map(t => {
          const over = t.date < todayIso();
          return `<div class="lesson-task" data-ltask="${t.id}">
            <button class="lt-check" data-action="ltoggle" data-id="${t.id}" aria-label="Отметить выполненным">
              <svg viewBox="0 0 24 24" fill="none"><path d="m5 12.5 4.5 4.5L19 7" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>
            </button>
            <div class="lt-body" data-action="ledit" data-id="${t.id}">
              <div class="lt-title">${esc(t.title)}</div>
              <div class="lt-meta ${over ? 'over' : (dayDiff(fromIso(t.date), new Date()) <= 2 ? 'soon' : '')}">сдать ${esc(humanDate(t.date))}</div>
            </div>
          </div>`;
        }).join('')
        : '<div class="lt-empty">Заданий по этому предмету нет 🎉</div>';

      return `<article class="lesson ${running ? 'now' : ''}" data-lesson="${l.id}">
        <div class="lesson-time">
          <span class="t1">${esc(l.start || '—')}</span>
          ${l.end ? `<span class="t2">${esc(l.end)}</span>` : ''}
        </div>
        <div class="lesson-main" data-action="lesson-edit" data-id="${l.id}">
          <p class="lesson-subject">${esc(l.subject || 'Урок')}${running ? '<span class="lesson-now">сейчас</span>' : ''}${weekMark}</p>
          ${l.room ? `<div class="lesson-room">каб. ${esc(l.room)}</div>` : ''}
          <div class="lesson-tasks">${tasksHtml}</div>
        </div>
        <button class="lesson-edit" data-action="lesson-edit" data-id="${l.id}" aria-label="Изменить урок">
          <svg viewBox="0 0 24 24" fill="none"><path d="M4 20h4l10.5-10.5a2.1 2.1 0 0 0-3-3L5 17v3Z" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/><path d="m14 6 3 3" stroke="currentColor" stroke-width="1.7"/></svg>
        </button>
      </article>`;
    }).join('');
  }

  /* ---------- календарь ---------- */
  function renderCalendar() {
    const m = ui.calMonth, y = ui.calYear;
    $('#calMonthLabel').textContent = `${RU_MONTHS[m]} ${y}`;

    const first = new Date(y, m, 1);
    const startOffset = (first.getDay() + 6) % 7;
    const daysInMonth = new Date(y, m + 1, 0).getDate();
    const prevMonthDays = new Date(y, m, 0).getDate();

    const byDate = new Map();
    state.tasks.forEach(t => {
      const d = fromIso(t.date);
      if (d.getMonth() === m && d.getFullYear() === y) {
        if (!byDate.has(t.date)) byDate.set(t.date, []);
        byDate.get(t.date).push(t);
      }
    });

    let cells = [];
    for (let i = startOffset; i > 0; i--) cells.push({ n: prevMonthDays - i + 1, muted: true });
    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${y}-${pad(m + 1)}-${pad(d)}`;
      cells.push({ n: d, muted: false, dateStr, items: byDate.get(dateStr) || [] });
    }
    let next = 1;
    while (cells.length % 7 !== 0) cells.push({ n: next++, muted: true });

    $('#calGrid').innerHTML = cells.map(c => {
      if (c.muted) return `<div class="day muted">${c.n}</div>`;
      const isToday = c.dateStr === todayIso();
      const isSel = c.dateStr === ui.selectedDay;
      const undone = c.items.filter(t => !t.done);
      const hasDone = c.items.some(t => t.done);
      const dots = [];
      if (undone.some(t => t.priority === 'high')) dots.push('<i class="dot dot-high"></i>');
      if (undone.some(t => (t.priority || 'mid') === 'mid')) dots.push('<i class="dot dot-mid"></i>');
      if (undone.some(t => t.priority === 'low')) dots.push('<i class="dot dot-low"></i>');
      if (hasDone && !undone.length) dots.push('<i class="dot dot-done"></i>');
      return `<button class="day ${isToday ? 'today' : ''} ${isSel ? 'selected' : ''}" data-date="${c.dateStr}">
          <span>${c.n}</span>
          <span class="day-dots">${dots.join('')}</span>
        </button>`;
    }).join('');

    const sel = ui.selectedDay;
    const items = tasksForDay(sel);
    $('#calDayTitle').textContent = sel ? `${humanDate(sel)}, ${RU_WEEK[fromIso(sel).getDay()]}` : 'Задания на день';
    $('#calTaskList').innerHTML = items.length
      ? items.map(taskCard).join('')
      : `<div class="empty" style="padding:26px 12px">
           <p class="empty-title">На этот день ничего нет</p>
           <p class="empty-text">Свободный день — или добавьте задание кнопкой «+ добавить».</p>
         </div>`;
  }

  /* ---------- общий рендер ---------- */
  function render() {
    if (ui.view === 'home') renderHome();
    else if (ui.view === 'schedule') renderSchedule();
    else renderCalendar();
    const d = new Date();
    $('#todayLabel').textContent = `${RU_WEEK[d.getDay()]}, ${d.getDate()} ${RU_MONTHS_GEN[d.getMonth()]}`;
    updateBell();
  }

  function setView(view) {
    ui.view = view;
    $$('.tab').forEach(t => t.classList.toggle('active', t.dataset.view === view));
    ['home', 'schedule', 'cal'].forEach(v => $('#view-' + v).classList.toggle('hidden', v !== view));
    render();
  }

  /* ---------- всплывающие сообщения ---------- */
  let toastTimer = null;
  function toast(msg, actionLabel, action) {
    const el = $('#toast');
    el.innerHTML = `<span>${esc(msg)}</span>`;
    if (actionLabel) {
      const b = document.createElement('button');
      b.textContent = actionLabel;
      b.onclick = () => { action(); hideToast(); };
      el.appendChild(b);
    }
    el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(hideToast, actionLabel ? 4200 : 1900);
  }
  function hideToast() { $('#toast').hidden = true; }

  /* ---------- форма задания ---------- */
  function openSheet(task, presetDate) {
    ui.editingId = task ? task.id : null;
    ui.priority = task ? (task.priority || 'mid') : 'mid';
    $('#sheetTitle').textContent = task ? 'Задание' : 'Новое задание';
    $('#fTitle').value = task ? task.title : '';
    $('#fSubject').value = task ? (task.subject || '') : (ui.subject || '');
    $('#fDate').value = task ? task.date : (presetDate || (ui.view === 'cal' ? ui.selectedDay : todayIso()));
    $('#fNotes').value = task ? (task.notes || '') : '';
    $('#btnDelete').hidden = !task;
    syncPriority();
    renderSubjectDatalist();
    renderSubjectSuggest();
    $('#sheetBackdrop').hidden = false;
    document.body.style.overflow = 'hidden';
    setTimeout(() => $('#fTitle').focus({ preventScroll: true }), 240);
  }

  function closeSheet() {
    $('#sheetBackdrop').hidden = true;
    document.body.style.overflow = '';
    ui.editingId = null;
  }

  function syncPriority() {
    $$('#prioritySeg button').forEach(b => b.classList.toggle('active', b.dataset.priority === ui.priority));
  }

  function renderSubjectDatalist() {
    $('#subjectOptions').innerHTML = allSubjects().map(s => `<option value="${esc(s)}"></option>`).join('');
  }

  function renderSubjectSuggest() {
    const used = Array.from(new Set(state.tasks.map(t => (t.subject || '').trim()).filter(Boolean)));
    const list = (used.length ? used : DEFAULT_SUBJECTS).slice(0, 8);
    $('#subjectSuggest').innerHTML = list.map(s => `<button type="button" data-subject="${esc(s)}">${esc(s)}</button>`).join('');
  }

  /* ---------- форма урока ---------- */
  function renderLessonDaySeg() {
    const days = [1, 2, 3, 4, 5, 6, 0];
    $('#lessonDaySeg').className = 'segmented segmented-7';
    $('#lessonDaySeg').innerHTML = days.map(d =>
      `<button type="button" data-day="${d}" class="${Number(ui.lessonDay) === d ? 'active' : ''}">${WEEK_SHORT[d]}</button>`
    ).join('');
  }

  function renderLessonWeekSeg() {
    $$('#lessonWeekSeg button').forEach(b => b.classList.toggle('active', b.dataset.week === ui.lessonWeek));
  }

  function openLessonSheet(lesson) {
    ui.lessonId = lesson ? lesson.id : null;
    ui.lessonDay = lesson ? Number(lesson.day) : Number(ui.schedDay);
    ui.lessonWeek = lesson ? (lesson.week || 'both') : 'both';
    $('#lessonSheetTitle').textContent = lesson ? 'Урок' : 'Новый урок';
    $('#lStart').value = lesson ? (lesson.start || '09:00') : '09:00';
    $('#lEnd').value = lesson ? (lesson.end || '') : '09:45';
    $('#lSubject').value = lesson ? (lesson.subject || '') : '';
    $('#lRoom').value = lesson ? (lesson.room || '') : '';
    $('#btnLessonDelete').hidden = !lesson;
    renderLessonDaySeg();
    renderLessonWeekSeg();
    renderSubjectDatalist();
    $('#lessonBackdrop').hidden = false;
    document.body.style.overflow = 'hidden';
  }

  function closeLessonSheet() {
    $('#lessonBackdrop').hidden = true;
    document.body.style.overflow = '';
    ui.lessonId = null;
  }

  function submitLesson(e) {
    e.preventDefault();
    const subject = $('#lSubject').value.trim();
    if (!subject) { $('#lSubject').focus(); return; }
    const data = {
      day: Number(ui.lessonDay),
      start: $('#lStart').value || '09:00',
      end: $('#lEnd').value || '',
      subject,
      room: $('#lRoom').value.trim(),
      week: ui.lessonWeek || 'both'
    };
    if (ui.lessonId) {
      const l = state.lessons.find(x => x.id === ui.lessonId);
      if (l) Object.assign(l, data);
      toast('Урок изменён');
    } else {
      state.lessons.push(Object.assign({ id: uid() }, data));
      toast('Урок добавлен');
    }
    if (!state.subjects.some(s => norm(s) === norm(subject))) state.subjects.push(subject);
    save(); closeLessonSheet(); render();
  }

  function deleteLesson() {
    if (!ui.lessonId) return;
    const id = ui.lessonId;
    const idx = state.lessons.findIndex(l => l.id === id);
    if (idx === -1) return;
    const [removed] = state.lessons.splice(idx, 1);
    save(); closeLessonSheet(); render();
    toast('Урок удалён', 'Вернуть', () => { state.lessons.push(removed); save(); render(); });
  }

  /* ---------- действия с заданиями ---------- */
  function toggleTask(id) {
    const t = state.tasks.find(x => x.id === id);
    if (!t) return;
    t.done = !t.done;
    t.doneAt = t.done ? Date.now() : null;
    save(); render();
    if (t.done) toast('Выполнено 👍', 'Отменить', () => { t.done = false; save(); render(); });
  }

  function saveTask(e) {
    e.preventDefault();
    const title = $('#fTitle').value.trim();
    if (!title) { $('#fTitle').focus(); return; }
    const subject = $('#fSubject').value.trim();
    const date = $('#fDate').value || todayIso();
    const notes = $('#fNotes').value.trim();
    const priority = ui.priority;

    if (ui.editingId) {
      const t = state.tasks.find(x => x.id === ui.editingId);
      if (t) Object.assign(t, { title, subject, date, notes, priority });
      toast('Изменения сохранены');
    } else {
      state.tasks.push({ id: uid(), title, subject, date, notes, priority, done: false, created: Date.now() });
      toast('Задание добавлено');
    }
    if (subject && !state.subjects.some(s => norm(s) === norm(subject))) state.subjects.push(subject);
    save(); closeSheet(); render();
  }

  function deleteTask() {
    if (!ui.editingId) return;
    const id = ui.editingId;
    const idx = state.tasks.findIndex(t => t.id === id);
    if (idx === -1) return;
    const [removed] = state.tasks.splice(idx, 1);
    save(); closeSheet(); render();
    toast('Задание удалено', 'Вернуть', () => { state.tasks.push(removed); save(); render(); });
  }

  /* ================= НАПОМИНАНИЯ ================= */
  function notifySupported() { return NATIVE || typeof window.Notification !== 'undefined'; }
  function permission() { return NATIVE ? 'granted' : (typeof window.Notification !== 'undefined' ? Notification.permission : 'unsupported'); }

  function updateBell() {
    const on = !!state.settings.notify && permission() === 'granted';
    const dot = $('#bellDot');
    if (on) dot.hidden = false; else dot.hidden = true;
    const hint = $('#notifyHint');
    if (hint) {
      hint.textContent = NATIVE
        ? 'В приложении напоминания системные: Android разбудит телефон в нужное время, даже если приложение полностью закрыто. Если уведомления не приходят, разрешите их в настройках Android → Приложения → Задания → Уведомления и разрешите «Будильники и напоминания».'
        : 'Напоминание срабатывает, когда приложение открыто или установлено на главный экран. Android не позволяет веб-приложению будить вас, если оно полностью закрыто, — поэтому дополнительно показывается баннер при запуске.';
    }
    $('#notifyToggle').checked = !!state.settings.notify;
    $('#notifyTime').value = state.settings.time || '09:00';
    $('#notifyBefore').value = String(state.settings.before ?? 1);
    $('#notifyState').textContent = NATIVE
      ? (state.settings.notify ? 'Включены · системные уведомления Android' : 'Выключены')
      : !notifySupported()
      ? 'Браузер не поддерживает уведомления'
      : permission() === 'granted'
        ? (state.settings.notify ? 'Включены' : 'Разрешение получено, напоминания выключены')
        : permission() === 'denied'
          ? 'Запрещены в настройках браузера'
          : 'Нужно разрешение браузера';
    renderNotifyPreview();
  }

  function renderNotifyPreview() {
    const when = reminderDateFor(nextUpcomingTask());
    const t = nextUpcomingTask();
    const el = $('#notifyPreview');
    if (!t || !when) {
      el.textContent = 'Нет активных заданий с будущим сроком — напоминание появится, как только добавите задание.';
      return;
    }
    const msg = `Ближайшее напоминание: ${fmtDateTime(when)} — «${t.title}»${t.subject ? ` (${t.subject})` : ''}, сдать ${humanDate(t.date)}.`;
    el.textContent = msg;
  }

  function nextUpcomingTask() {
    const now = Date.now();
    return state.tasks
      .filter(t => !t.done && reminderDateFor(t) && reminderDateFor(t).getTime() > now)
      .sort((a, b) => reminderDateFor(a) - reminderDateFor(b))[0] || null;
  }

  function reminderDateFor(task) {
    if (!task || !task.date) return null;
    const days = Number(state.settings.before ?? 1);
    const d = fromIso(task.date);
    d.setDate(d.getDate() - days);
    const [h, m] = String(state.settings.time || '09:00').split(':').map(Number);
    d.setHours(h || 9, m || 0, 0, 0);
    return d;
  }

  function fmtDateTime(d) {
    if (!d) return '';
    return `${d.getDate()} ${RU_MONTHS_GEN[d.getMonth()]}, ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  async function enableNotifications(on) {
    if (!on) {
      state.settings.notify = false; save(); updateBell(); toast('Напоминания выключены'); return;
    }
    if (NATIVE) {
      state.settings.notify = true;
      save(); updateBell();
      try { window.NativeApp.requestPermissions(); } catch (e) { }
      toast('Напоминания включены — придут даже при закрытом приложении');
      return;
    }
    if (!notifySupported()) { toast('Браузер не поддерживает уведомления'); updateBell(); return; }
    let perm = permission();
    if (perm === 'default') {
      try { perm = await Notification.requestPermission(); }
      catch (e) { try { perm = await new Promise(res => Notification.requestPermission(res)); } catch (e2) { perm = 'denied'; } }
    }
    if (perm !== 'granted') {
      state.settings.notify = false; save(); updateBell();
      toast(perm === 'denied' ? 'Уведомления запрещены в настройках браузера' : 'Разрешение не выдано');
      return;
    }
    state.settings.notify = true; save(); updateBell();
    toast('Напоминания включены');
    checkReminders(true);
  }

  function showNotification(title, body) {
    try {
      const n = new Notification(title, {
        body,
        icon: ICON_URL,
        badge: ICON_URL,
        tag: 'deadline',
        lang: 'ru'
      });
      n.onclick = () => { try { window.focus(); } catch (e) { } n.close(); };
      setTimeout(() => { try { n.close(); } catch (e) { } }, 12000);
      return true;
    } catch (e) {
      return false;
    }
  }

  function checkReminders(force) {
    if (!state.settings.notify || permission() !== 'granted') return;
    const now = Date.now();
    state.tasks.forEach(t => {
      if (t.done) return;
      const at = reminderDateFor(t);
      if (!at || at.getTime() > now) return;
      // не напоминаем о том, что просрочено очень давно (больше 30 дней)
      if (now - at.getTime() > 30 * 86400000) return;
      const key = t.id + '@' + t.date;
      if (state.notified[key] && !force) return;
      const body = `${t.subject ? t.subject + ': ' : ''}${t.title} — сдать ${humanDate(t.date)}`;
      const sent = showNotification('Скоро дедлайн', body);
      if (sent) state.notified[key] = Date.now();
    });
    save();
  }

  function bannerForOverdue() {
    const today = todayIso();
    const near = state.tasks
      .filter(t => !t.done && t.date <= iso(new Date(Date.now() + 86400000)))
      .sort((a, b) => a.date < b.date ? -1 : 1);
    const banner = $('#reminderBanner');
    if (!near.length) { banner.hidden = true; return; }
    const overdue = near.filter(t => t.date < today).length;
    banner.hidden = false;
    $('#bannerTitle').textContent = overdue
      ? `Просрочено: ${overdue} ${plural(overdue, 'задание', 'задания', 'заданий')}`
      : 'Дедлайн сегодня или завтра';
    $('#bannerSub').textContent = `${near[0].subject ? near[0].subject + ' · ' : ''}${near[0].title}`;
  }

  /* ================= РЕЗЕРВНАЯ КОПИЯ ================= */
  function exportData() {
    const payload = { app: 'study-planner', version: 1, exportedAt: new Date().toISOString(), tasks: state.tasks, lessons: state.lessons, subjects: state.subjects, settings: state.settings };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `zadaniya-${todayIso()}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    toast('Копия сохранена в загрузки');
  }

  function importData(file) {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(String(reader.result));
        if (!data || !Array.isArray(data.tasks)) throw new Error('bad file');
        state.tasks = data.tasks.map(t => Object.assign({ id: uid(), done: false }, t));
        state.lessons = Array.isArray(data.lessons) ? data.lessons.map(l => Object.assign({ id: uid() }, l)) : state.lessons;
        if (Array.isArray(data.subjects) && data.subjects.length) state.subjects = data.subjects;
        if (data.settings) state.settings = Object.assign({}, state.settings, data.settings);
        state.notified = {};
        save(); render();
        $('#importHint').textContent = `Загружено: ${state.tasks.length} ${plural(state.tasks.length, 'задание', 'задания', 'заданий')}, ${state.lessons.length} ${plural(state.lessons.length, 'урок', 'урока', 'уроков')}.`;
        toast('Копия загружена');
      } catch (e) {
        $('#importHint').textContent = 'Не получилось прочитать файл. Нужен .json, сохранённый этим приложением.';
        toast('Ошибка: это не резервная копия');
      }
    };
    reader.readAsText(file);
  }

  /* ---------- события ---------- */
  function bind() {
    $$('.tab').forEach(tab => tab.addEventListener('click', () => setView(tab.dataset.view)));

    $('#filterChips').addEventListener('click', e => {
      const chip = e.target.closest('.chip');
      if (!chip) return;
      if (chip.classList.contains('chip-subject')) { ui.subject = null; renderHome(); return; }
      ui.filter = chip.dataset.filter;
      ui.subject = null;
      renderHome();
    });

    $$('.stat').forEach(s => s.addEventListener('click', () => {
      ui.filter = s.dataset.scope === 'week' ? 'active' : s.dataset.scope;
      ui.subject = null; ui.search = ''; $('#searchInput').value = '';
      setView('home');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }));

    let sTimer = null;
    $('#searchInput').addEventListener('input', e => {
      clearTimeout(sTimer);
      const v = e.target.value;
      sTimer = setTimeout(() => { ui.search = v; renderHome(); }, 120);
    });

    document.addEventListener('click', e => {
      const btn = e.target.closest('[data-action]');
      if (btn) {
        const action = btn.dataset.action;

        if (action === 'ltoggle') { e.stopPropagation(); toggleTask(btn.dataset.id); return; }
        if (action === 'ledit') {
          const t = state.tasks.find(x => x.id === btn.dataset.id);
          if (t) openSheet(t);
          return;
        }
        if (action === 'lesson-edit') {
          const l = state.lessons.find(x => x.id === btn.dataset.id);
          if (l) openLessonSheet(l);
          return;
        }
        const card = btn.closest('.task');
        if (!card) return;
        const id = card.dataset.id;
        if (action === 'toggle') { e.stopPropagation(); toggleTask(id); return; }
        if (action === 'subject') {
          e.stopPropagation();
          ui.subject = btn.dataset.subject; ui.filter = 'all'; ui.search = ''; $('#searchInput').value = '';
          setView('home');
          window.scrollTo({ top: 0, behavior: 'smooth' });
          return;
        }
        if (action === 'edit') {
          const t = state.tasks.find(x => x.id === id);
          if (t) openSheet(t);
        }
      }
      const day = e.target.closest('.day[data-date]');
      if (day) { ui.selectedDay = day.dataset.date; renderCalendar(); }
    });

    // расписание: синяя / красная неделя
    $('#weekSwitch').addEventListener('click', e => {
      const b = e.target.closest('button[data-week]');
      if (!b) return;
      ui.schedWeekOffset = offsetForType(b.dataset.week);
      renderSchedule();
    });

    // расписание: дни недели
    $('#dayChips').addEventListener('click', e => {
      const chip = e.target.closest('.day-chip');
      if (!chip) return;
      ui.schedDay = Number(chip.dataset.day);
      renderSchedule();
    });

    // добавить: на главной — задание, в расписании — урок
    $('#fabAdd').addEventListener('click', () => {
      if (ui.view === 'schedule') openLessonSheet(null);
      else openSheet(null);
    });
    $('#addLessonBtn').addEventListener('click', () => openLessonSheet(null));
    $('#calAddBtn').addEventListener('click', () => openSheet(null, ui.selectedDay));

    $('#sheetClose').addEventListener('click', closeSheet);
    $('#sheetBackdrop').addEventListener('click', e => { if (e.target.id === 'sheetBackdrop') closeSheet(); });
    $('#lessonClose').addEventListener('click', closeLessonSheet);
    $('#lessonBackdrop').addEventListener('click', e => { if (e.target.id === 'lessonBackdrop') closeLessonSheet(); });

    document.addEventListener('keydown', e => {
      if (e.key !== 'Escape') return;
      if (!$('#sheetBackdrop').hidden) closeSheet();
      if (!$('#lessonBackdrop').hidden) closeLessonSheet();
      if (!$('#settingsBackdrop').hidden) closeSettings();
    });

    $('#taskForm').addEventListener('submit', saveTask);
    $('#btnDelete').addEventListener('click', deleteTask);
    $$('#prioritySeg button').forEach(b => b.addEventListener('click', () => { ui.priority = b.dataset.priority; syncPriority(); }));
    $('#subjectSuggest').addEventListener('click', e => {
      const b = e.target.closest('button[data-subject]');
      if (b) $('#fSubject').value = b.dataset.subject;
    });

    $('#lessonForm').addEventListener('submit', submitLesson);
    $('#btnLessonDelete').addEventListener('click', deleteLesson);
    $('#lessonWeekSeg').addEventListener('click', e => {
      const b = e.target.closest('button[data-week]');
      if (!b) return;
      ui.lessonWeek = b.dataset.week;
      renderLessonWeekSeg();
    });
    $('#lessonDaySeg').addEventListener('click', e => {
      const b = e.target.closest('button[data-day]');
      if (!b) return;
      ui.lessonDay = Number(b.dataset.day);
      renderLessonDaySeg();
    });

    // календарь
    $('#prevMonth').addEventListener('click', () => {
      ui.calMonth--; if (ui.calMonth < 0) { ui.calMonth = 11; ui.calYear--; } renderCalendar();
    });
    $('#nextMonth').addEventListener('click', () => {
      ui.calMonth++; if (ui.calMonth > 11) { ui.calMonth = 0; ui.calYear++; } renderCalendar();
    });
    $('#calMonthLabel').addEventListener('click', () => {
      const now = new Date();
      ui.calMonth = now.getMonth(); ui.calYear = now.getFullYear();
      ui.selectedDay = todayIso(); renderCalendar();
    });

    // настройки
    $('#settingsBtn').addEventListener('click', openSettings);
    $('#settingsClose').addEventListener('click', closeSettings);
    $('#settingsBackdrop').addEventListener('click', e => { if (e.target.id === 'settingsBackdrop') closeSettings(); });
    $('#notifyToggle').addEventListener('change', e => enableNotifications(e.target.checked));
    $('#notifyTime').addEventListener('change', e => { state.settings.time = e.target.value || '09:00'; state.notified = {}; save(); renderNotifyPreview(); });
    $('#notifyBefore').addEventListener('change', e => { state.settings.before = Number(e.target.value); state.notified = {}; save(); renderNotifyPreview(); });
    $('#btnTestNotify').addEventListener('click', async () => {
      if (NATIVE) {
        try { window.NativeApp.testNotification(); toast('Уведомление отправлено'); } catch (e) { toast('Не удалось отправить'); }
        return;
      }
      if (permission() !== 'granted') { await enableNotifications(true); }
      if (permission() !== 'granted') return;
      const ok = showNotification('Проверка уведомлений', 'Так будет выглядеть напоминание о дедлайне.');
      toast(ok ? 'Уведомление отправлено' : 'Не удалось показать уведомление');
    });
    $('#nowWeekSeg').addEventListener('click', e => {
      const b = e.target.closest('button[data-type]');
      if (!b) return;
      state.settings.weekType = b.dataset.type;
      state.settings.weekAnchor = iso(mondayOf(new Date()));
      save(); syncWeekSettings(); render();
      toast(`Сейчас ${b.dataset.type === 'blue' ? 'синяя' : 'красная'} неделя`);
    });
    $('#btnExport').addEventListener('click', exportData);
    $('#importFile').addEventListener('change', e => {
      const f = e.target.files && e.target.files[0];
      if (f) importData(f);
      e.target.value = '';
    });

    $('#reminderBanner').addEventListener('click', () => {
      ui.filter = 'overdue'; ui.subject = null;
      setView('home');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });

    // периодическая проверка напоминаний + обновление времени "сейчас" в расписании
    setInterval(() => { checkReminders(false); bannerForOverdue(); }, 30000);
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) { bannerForOverdue(); checkReminders(false); render(); }
    });
  }

  function syncWeekSettings() {
    const cur = currentWeekType();
    $$('#nowWeekSeg button').forEach(b => b.classList.toggle('active', b.dataset.type === cur));
    const nextType = cur === 'blue' ? 'red' : 'blue';
    const monday = mondayOf(new Date());
    const sunday = new Date(monday.getTime() + 6 * 86400000);
    const nextMonday = new Date(monday.getTime() + 7 * 86400000);
    const nextSunday = new Date(monday.getTime() + 13 * 86400000);
    $('#weekHint').innerHTML = `Сейчас идёт <b style="color:${cur === 'blue' ? '#a8caff' : '#ffbcc3'}">${cur === 'blue' ? 'синяя' : 'красная'}</b> неделя (${fmtRange(monday, sunday)}). Следующая — ${nextType === 'blue' ? 'синяя' : 'красная'} (${fmtRange(nextMonday, nextSunday)}). Если цвета не совпадают с дневником — нажмите нужный.`;
  }

  function openSettings() {
    updateBell();
    syncWeekSettings();
    $('#settingsBackdrop').hidden = false;
    document.body.style.overflow = 'hidden';
  }
  function closeSettings() {
    $('#settingsBackdrop').hidden = true;
    document.body.style.overflow = '';
  }

  /* ---------- запуск ---------- */
  seedIfNeeded();
  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
    window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => { }));
  }
  bind();
  render();
  bannerForOverdue();
  setTimeout(() => checkReminders(false), 1200);
})();
