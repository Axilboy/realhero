import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
} from "react";
import { useShellTabIndex } from "../context/ShellTabContext";
import { useI18n } from "../i18n/I18nContext";
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

export default function TodoModule() {
  const { t } = useI18n();
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

  const tabsNav = useMemo(
    () =>
      [
        { key: 0, label: t("todo.tabToday") },
        { key: 1, label: t("todo.tabInbox") },
        { key: 2, label: t("todo.tabAll") },
      ] as const,
    [t],
  );

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
    const active = tasks.filter((task) => !task.completedAt);
    const done = tasks.filter((task) => !!task.completedAt);

    const inbox = active.filter((task) => task.dueDate == null);

    const forDay = (d: string) => {
      const activeDay = active.filter(
        (task) => task.dueDate != null && task.dueDate <= d,
      );
      const doneOnDay = done.filter(
        (task) => localYmdFromIso(task.completedAt!) === d,
      );
      const overdue = activeDay.filter((task) => task.dueDate! < d);
      const dueToday = activeDay.filter((task) => task.dueDate === d);
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

  async function onToggle(task: UserTaskRow) {
    setErr(null);
    const next = !task.completedAt;
    const r = await patchTask(task.id, { completed: next });
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
      <h1 className="screen__title todo-mod__title">{t("todo.title")}</h1>

      <div className="todo-mod__subnav" role="tablist" aria-label={t("todo.sectionsAria")}>
        {tabsNav.map((tb) => (
          <button
            key={tb.key}
            type="button"
            role="tab"
            aria-selected={tab === tb.key}
            className={`todo-mod__subbtn${tab === tb.key ? " todo-mod__subbtn--on" : ""}`}
            onClick={() => setTab(tb.key)}
          >
            {tb.label}
          </button>
        ))}
      </div>

      {tab === 0 && (
        <div className="todo-mod__daybar">
          <label className="todo-mod__daylabel">
            <span className="todo-mod__dayhint">{t("todo.dayHint")}</span>
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
            {t("todo.todayHeading")}
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
          <p className="todo-mod__muted">{t("todo.loading")}</p>
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
            empty={t("todo.emptyInbox")}
            onToggle={onToggle}
            onDelete={onDelete}
          />
        ) : (
          <TaskList
            tasks={lists.allActive}
            empty={t("todo.emptyActive")}
            onToggle={onToggle}
            onDelete={onDelete}
          />
        )}
      </div>

      <form className="todo-mod__add" onSubmit={(e) => void onSubmit(e)}>
        <input
          className="todo-mod__input"
          placeholder={t("todo.newTaskPlaceholder")}
          value={newTitle}
          onChange={(e) => setNewTitle(e.target.value)}
          maxLength={500}
          aria-label={t("todo.taskTextAria")}
        />
        <input
          className="todo-mod__input todo-mod__input--note"
          placeholder={t("todo.notePlaceholder")}
          value={newNote}
          onChange={(e) => setNewNote(e.target.value)}
          maxLength={4000}
        />
        <div className="todo-mod__row">
          <span className="todo-mod__muted">{t("todo.due")}</span>
          <select
            className="todo-mod__select"
            value={newDue}
            onChange={(e) =>
              setNewDue(e.target.value as "none" | "day" | "custom")
            }
            aria-label={t("todo.dueAria")}
          >
            <option value="day">
              {tab === 0 ? t("todo.dueSelectedDay") : t("todo.dueToday")}
            </option>
            <option value="none">{t("todo.dueNone")}</option>
            <option value="custom">{t("todo.dueCustom")}</option>
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
            aria-label={t("todo.timeAria")}
          />
        </div>
        <button type="submit" className="todo-mod__submit">
          {t("todo.add")}
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
  onToggle: (task: UserTaskRow) => void;
  onDelete: (id: string) => void;
}) {
  const { t } = useI18n();
  const hasAny =
    overdue.length + dueToday.length + doneOnDay.length > 0;
  if (!hasAny) {
    return (
      <p className="todo-mod__muted">
        {t("todo.emptyDay", { day: dayLabel })}
      </p>
    );
  }
  return (
    <>
      {overdue.length > 0 ? (
        <>
          <h2 className="todo-mod__h2">{t("todo.overdue")}</h2>
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
          <h2 className="todo-mod__h2">{t("todo.onDay")}</h2>
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
          <h2 className="todo-mod__h2">{t("todo.done")}</h2>
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
  onToggle: (task: UserTaskRow) => void;
  onDelete: (id: string) => void;
  done?: boolean;
}) {
  const { t } = useI18n();
  if (tasks.length === 0 && empty) {
    return <p className="todo-mod__muted">{empty}</p>;
  }
  if (tasks.length === 0) return null;
  return (
    <ul className="todo-mod__list">
      {tasks.map((task) => (
        <li key={task.id} className="todo-mod__li">
          <label className="todo-mod__label">
            <input
              type="checkbox"
              className="todo-mod__check"
              checked={!!task.completedAt}
              onChange={() => onToggle(task)}
            />
            <span
              className={`todo-mod__task-title${done || task.completedAt ? " todo-mod__task-title--done" : ""}`}
            >
              {task.title}
            </span>
            {task.source === "QUEST" ? (
              <span className="todo-mod__badge" title={t("todo.questTitle")}>
                {t("todo.questBadge")}
              </span>
            ) : null}
            {task.dueTime ? (
              <span className="todo-mod__timepill">{task.dueTime}</span>
            ) : null}
            {task.dueDate && !done ? (
              <span className="todo-mod__duepill">{task.dueDate}</span>
            ) : null}
          </label>
          {task.note ? (
            <p className="todo-mod__note">{task.note}</p>
          ) : null}
          <button
            type="button"
            className="todo-mod__del"
            onClick={() => void onDelete(task.id)}
            aria-label={t("todo.deleteTaskAria")}
          >
            {t("todo.delete")}
          </button>
        </li>
      ))}
    </ul>
  );
}
