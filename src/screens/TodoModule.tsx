import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
} from "react";
import { useShellTabIndex } from "../context/ShellTabContext";
import {
  createTask,
  deleteTask,
  errorMessage,
  fetchTasks,
  patchTask,
  type UserTaskRow,
} from "../lib/todoApi";

const SHELL_TAB_TODO = 3;

function todayYmd(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function localYmdFromIso(iso: string): string {
  const d = new Date(iso);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

const TABS = [
  { key: 0, label: "Сегодня" },
  { key: 1, label: "Входящие" },
  { key: 2, label: "Все" },
] as const;

export default function TodoModule() {
  const shellTab = useShellTabIndex();
  const todoActive = shellTab === SHELL_TAB_TODO;

  const [tab, setTab] = useState(0);
  const [bump, setBump] = useState(0);
  const [pending, setPending] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [tasks, setTasks] = useState<UserTaskRow[]>([]);
  const [day, setDay] = useState(todayYmd);

  const [newTitle, setNewTitle] = useState("");
  const [newNote, setNewNote] = useState("");
  const [newDue, setNewDue] = useState<"none" | "day" | "custom">("day");
  const [newDueCustom, setNewDueCustom] = useState(todayYmd);
  const [newTime, setNewTime] = useState("");

  const refresh = useCallback(async () => {
    setErr(null);
    const r = await fetchTasks("all");
    if (!r.ok) {
      setErr(errorMessage(r.data));
      setPending(false);
      return;
    }
    setTasks(r.data.tasks);
    setPending(false);
  }, []);

  useEffect(() => {
    if (!todoActive) return;
    void refresh();
  }, [todoActive, bump, refresh]);

  const lists = useMemo(() => {
    const active = tasks.filter((t) => !t.completedAt);
    const done = tasks.filter((t) => !!t.completedAt);

    const inbox = active.filter((t) => t.dueDate == null);

    const forDay = (d: string) => {
      const activeDay = active.filter(
        (t) => t.dueDate != null && t.dueDate <= d,
      );
      const doneOnDay = done.filter((t) => localYmdFromIso(t.completedAt!) === d);
      const overdue = activeDay.filter((t) => t.dueDate! < d);
      const dueToday = activeDay.filter((t) => t.dueDate === d);
      overdue.sort((a, b) => a.dueDate!.localeCompare(b.dueDate!));
      dueToday.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
      doneOnDay.sort((a, b) => b.completedAt!.localeCompare(a.completedAt!));
      return { overdue, dueToday, doneOnDay };
    };

    const allActive = [...active].sort((a, b) => {
      if (a.dueDate == null && b.dueDate == null) {
        return b.createdAt.localeCompare(a.createdAt);
      }
      if (a.dueDate == null) return 1;
      if (b.dueDate == null) return -1;
      const c = a.dueDate.localeCompare(b.dueDate);
      if (c !== 0) return c;
      return b.createdAt.localeCompare(a.createdAt);
    });

    return { inbox, forDay, allActive };
  }, [tasks]);

  async function onToggle(t: UserTaskRow) {
    setErr(null);
    const next = !t.completedAt;
    const r = await patchTask(t.id, { completed: next });
    if (!r.ok) {
      setErr(errorMessage(r.data));
      return;
    }
    setBump((x) => x + 1);
  }

  async function onDelete(id: string) {
    setErr(null);
    const r = await deleteTask(id);
    if (!r.ok) {
      setErr(errorMessage(r.data));
      return;
    }
    setBump((x) => x + 1);
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const title = newTitle.trim();
    if (!title) return;

    let dueDate: string | null = null;
    if (tab === 1) dueDate = null;
    else if (tab === 0) {
      if (newDue === "none") dueDate = null;
      else if (newDue === "day") dueDate = day;
      else dueDate = newDueCustom;
    } else {
      if (newDue === "none") dueDate = null;
      else if (newDue === "day") dueDate = todayYmd();
      else dueDate = newDueCustom;
    }

    const dueTime =
      newTime.trim() && /^([01]\d|2[0-3]):[0-5]\d$/.test(newTime.trim())
        ? newTime.trim()
        : null;

    const r = await createTask({
      title,
      note: newNote.trim() || null,
      dueDate,
      dueTime,
    });
    if (!r.ok) {
      setErr(errorMessage(r.data));
      return;
    }
    setNewTitle("");
    setNewNote("");
    setNewTime("");
    setBump((x) => x + 1);
  }

  const block = lists.forDay(day);

  return (
    <div className="todo-mod">
      <h1 className="screen__title todo-mod__title">Задачи</h1>

      <div className="todo-mod__subnav" role="tablist" aria-label="Разделы задач">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={tab === t.key}
            className={`todo-mod__subbtn${tab === t.key ? " todo-mod__subbtn--on" : ""}`}
            onClick={() => setTab(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 0 && (
        <div className="todo-mod__daybar">
          <label className="todo-mod__daylabel">
            <span className="todo-mod__dayhint">День</span>
            <input
              type="date"
              className="todo-mod__date"
              value={day}
              onChange={(e) => setDay(e.target.value)}
            />
          </label>
          <button
            type="button"
            className="todo-mod__today"
            onClick={() => setDay(todayYmd())}
          >
            Сегодня
          </button>
        </div>
      )}

      {err ? (
        <p className="todo-mod__err" role="alert">
          {err}
        </p>
      ) : null}

      <div className="todo-mod__scroll">
        {pending ? (
          <p className="todo-mod__muted">Загрузка…</p>
        ) : tab === 0 ? (
          <TaskSections
            overdue={block.overdue}
            dueToday={block.dueToday}
            doneOnDay={block.doneOnDay}
            dayLabel={day}
            onToggle={onToggle}
            onDelete={onDelete}
          />
        ) : tab === 1 ? (
          <TaskList
            tasks={lists.inbox}
            empty="Входящих нет — добавьте задачу без даты."
            onToggle={onToggle}
            onDelete={onDelete}
          />
        ) : (
          <TaskList
            tasks={lists.allActive}
            empty="Активных задач нет."
            onToggle={onToggle}
            onDelete={onDelete}
          />
        )}
      </div>

      <form className="todo-mod__add" onSubmit={(e) => void onSubmit(e)}>
        <input
          className="todo-mod__input"
          placeholder="Новая задача…"
          value={newTitle}
          onChange={(e) => setNewTitle(e.target.value)}
          maxLength={500}
          aria-label="Текст задачи"
        />
        <input
          className="todo-mod__input todo-mod__input--note"
          placeholder="Заметка (необязательно)"
          value={newNote}
          onChange={(e) => setNewNote(e.target.value)}
          maxLength={4000}
        />
        <div className="todo-mod__row">
          <span className="todo-mod__muted">Срок</span>
          <select
            className="todo-mod__select"
            value={newDue}
            onChange={(e) =>
              setNewDue(e.target.value as "none" | "day" | "custom")
            }
            aria-label="Срок"
          >
            <option value="day">
              {tab === 0 ? "Выбранный день" : "Сегодня"}
            </option>
            <option value="none">Без даты</option>
            <option value="custom">Дата…</option>
          </select>
          {newDue === "custom" ? (
            <input
              type="date"
              className="todo-mod__date todo-mod__date--inline"
              value={newDueCustom}
              onChange={(e) => setNewDueCustom(e.target.value)}
            />
          ) : null}
          <input
            type="time"
            className="todo-mod__time"
            value={newTime}
            onChange={(e) => setNewTime(e.target.value)}
            aria-label="Время"
          />
        </div>
        <button type="submit" className="todo-mod__submit">
          Добавить
        </button>
      </form>
    </div>
  );
}

function TaskSections({
  overdue,
  dueToday,
  doneOnDay,
  dayLabel,
  onToggle,
  onDelete,
}: {
  overdue: UserTaskRow[];
  dueToday: UserTaskRow[];
  doneOnDay: UserTaskRow[];
  dayLabel: string;
  onToggle: (t: UserTaskRow) => void;
  onDelete: (id: string) => void;
}) {
  const hasAny =
    overdue.length + dueToday.length + doneOnDay.length > 0;
  if (!hasAny) {
    return (
      <p className="todo-mod__muted">
        На {dayLabel} нет задач. Добавьте ниже или перенесите срок из «Все».
      </p>
    );
  }
  return (
    <>
      {overdue.length > 0 ? (
        <>
          <h2 className="todo-mod__h2">Просрочено</h2>
          <TaskList
            tasks={overdue}
            onToggle={onToggle}
            onDelete={onDelete}
            empty=""
          />
        </>
      ) : null}
      {dueToday.length > 0 ? (
        <>
          <h2 className="todo-mod__h2">На день</h2>
          <TaskList
            tasks={dueToday}
            onToggle={onToggle}
            onDelete={onDelete}
            empty=""
          />
        </>
      ) : null}
      {doneOnDay.length > 0 ? (
        <>
          <h2 className="todo-mod__h2">Сделано</h2>
          <TaskList
            tasks={doneOnDay}
            onToggle={onToggle}
            onDelete={onDelete}
            empty=""
            done
          />
        </>
      ) : null}
    </>
  );
}

function TaskList({
  tasks,
  empty,
  onToggle,
  onDelete,
  done = false,
}: {
  tasks: UserTaskRow[];
  empty: string;
  onToggle: (t: UserTaskRow) => void;
  onDelete: (id: string) => void;
  done?: boolean;
}) {
  if (tasks.length === 0 && empty) {
    return <p className="todo-mod__muted">{empty}</p>;
  }
  if (tasks.length === 0) return null;
  return (
    <ul className="todo-mod__list">
      {tasks.map((t) => (
        <li key={t.id} className="todo-mod__li">
          <label className="todo-mod__label">
            <input
              type="checkbox"
              className="todo-mod__check"
              checked={!!t.completedAt}
              onChange={() => onToggle(t)}
            />
            <span
              className={`todo-mod__task-title${done || t.completedAt ? " todo-mod__task-title--done" : ""}`}
            >
              {t.title}
            </span>
            {t.source === "QUEST" ? (
              <span className="todo-mod__badge" title="Квест">
                Квест
              </span>
            ) : null}
            {t.dueTime ? (
              <span className="todo-mod__timepill">{t.dueTime}</span>
            ) : null}
            {t.dueDate && !done ? (
              <span className="todo-mod__duepill">{t.dueDate}</span>
            ) : null}
          </label>
          {t.note ? (
            <p className="todo-mod__note">{t.note}</p>
          ) : null}
          <button
            type="button"
            className="todo-mod__del"
            onClick={() => void onDelete(t.id)}
            aria-label="Удалить задачу"
          >
            Удалить
          </button>
        </li>
      ))}
    </ul>
  );
}
