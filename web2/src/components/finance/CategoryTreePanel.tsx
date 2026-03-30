import { useMemo, useRef, useState, type FormEvent } from "react";
import { useI18n } from "../../i18n/I18nContext";
import {
  type Category,
  type CategoryType,
  type CreateCategoryPayload,
} from "../../lib/financeApi";
import {
  CATEGORY_COLOR_PRESETS,
  CATEGORY_EMOJI_PRESETS,
  defaultColorForIndex,
  defaultEmojiForName,
  tintColorForEmojiIndex,
} from "./categoryPresets";

type CatTab = "EXPENSE" | "INCOME";

function matchesTab(c: Category, tab: CatTab): boolean {
  return c.type === "BOTH" || c.type === (tab === "EXPENSE" ? "EXPENSE" : "INCOME");
}

function isUserVisible(c: Category, hideNames: Set<string>): boolean {
  if (c.excludeFromReporting) return false;
  if (hideNames.has(c.name)) return false;
  return true;
}

type Props = {
  categories: Category[];
  catBusy: boolean;
  catError: string | null;
  hideCategoryNames: Set<string>;
  /** Если true — в списке видны архивные (при включённой загрузке с сервера). */
  showArchived?: boolean;
  onCreate: (payload: CreateCategoryPayload) => Promise<void>;
  onToggleArchive: (c: Category) => void;
};

export default function CategoryTreePanel({
  categories,
  catBusy,
  catError,
  hideCategoryNames,
  showArchived = false,
  onCreate,
  onToggleArchive,
}: Props) {
  const { t } = useI18n();
  const [tab, setTab] = useState<CatTab>("EXPENSE");
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const [subFormParentId, setSubFormParentId] = useState<string | null>(null);

  const [newName, setNewName] = useState("");
  const [newEmoji, setNewEmoji] = useState(CATEGORY_EMOJI_PRESETS[0]!);
  const [newColor, setNewColor] = useState(CATEGORY_COLOR_PRESETS[0]!);
  const rootStyleDetailsRef = useRef<HTMLDetailsElement>(null);

  const [subName, setSubName] = useState("");

  const archOk = (c: Category) => showArchived || !c.isArchived;

  const filteredRoots = useMemo(() => {
    const q = search.trim().toLowerCase();
    const roots = categories.filter(
      (c) =>
        !c.parentId &&
        archOk(c) &&
        matchesTab(c, tab) &&
        isUserVisible(c, hideCategoryNames),
    );
    if (!q) return roots;
    return roots.filter((r) => {
      if (r.name.toLowerCase().includes(q)) return true;
      return categories.some(
        (ch) =>
          ch.parentId === r.id &&
          archOk(ch) &&
          ch.name.toLowerCase().includes(q),
      );
    });
  }, [categories, tab, search, hideCategoryNames, showArchived]);

  function childrenOf(parentId: string): Category[] {
    return categories
      .filter(
        (c) =>
          c.parentId === parentId &&
          archOk(c) &&
          isUserVisible(c, hideCategoryNames),
      )
      .sort(
        (a, b) =>
          a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, "ru"),
      );
  }

  function toggleExpand(id: string) {
    setExpanded((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }

  async function submitRoot(e: FormEvent) {
    e.preventDefault();
    const name = newName.trim();
    if (!name) return;
    const type: CategoryType = tab === "EXPENSE" ? "EXPENSE" : "INCOME";
    const useCustomStyle = rootStyleDetailsRef.current?.open === true;
    await onCreate({
      name,
      type,
      iconEmoji: useCustomStyle
        ? newEmoji
        : defaultEmojiForName(name) || CATEGORY_EMOJI_PRESETS[0]!,
      accentColor: useCustomStyle
        ? newColor
        : defaultColorForIndex(categories.length),
    });
    setNewName("");
    setNewEmoji(defaultEmojiForName(name) || CATEGORY_EMOJI_PRESETS[0]!);
    setNewColor(defaultColorForIndex(categories.length));
  }

  async function submitSub(e: FormEvent) {
    e.preventDefault();
    if (!subFormParentId) return;
    const name = subName.trim();
    if (!name) return;
    const parent = categories.find((c) => c.id === subFormParentId);
    if (!parent) return;
    await onCreate({
      name,
      type: parent.type === "BOTH" ? (tab === "EXPENSE" ? "EXPENSE" : "INCOME") : parent.type,
      parentId: subFormParentId,
      iconEmoji: defaultEmojiForName(name) || CATEGORY_EMOJI_PRESETS[0]!,
      accentColor: parent.accentColor || CATEGORY_COLOR_PRESETS[0]!,
    });
    setSubName("");
    setSubFormParentId(null);
    setExpanded((p) => new Set(p).add(subFormParentId));
  }

  return (
    <div className="finproto-cat">
      <div className="finproto-cat__tabs" role="tablist">
        <button
          type="button"
          role="tab"
          className={
            tab === "EXPENSE"
              ? "finproto-cat__tab finproto-cat__tab--on"
              : "finproto-cat__tab"
          }
          aria-selected={tab === "EXPENSE"}
          onClick={() => setTab("EXPENSE")}
        >
          {t("fin.catTabExpense")}
        </button>
        <button
          type="button"
          role="tab"
          className={
            tab === "INCOME"
              ? "finproto-cat__tab finproto-cat__tab--on"
              : "finproto-cat__tab"
          }
          aria-selected={tab === "INCOME"}
          onClick={() => setTab("INCOME")}
        >
          {t("fin.catTabIncome")}
        </button>
      </div>

      <div className="finproto-cat__search-wrap">
        <span className="finproto-cat__search-ic" aria-hidden>
          🔍
        </span>
        <input
          className="finproto-cat__search"
          type="search"
          placeholder={t("fin.catSearch")}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          autoComplete="off"
        />
      </div>

      {catError ? <p className="finance__err">{catError}</p> : null}

      <ul className="finproto-cat__tree" role="list">
        {filteredRoots.map((root) => {
          const ch = childrenOf(root.id);
          const open = expanded.has(root.id);
          const emoji = root.iconEmoji || "📁";
          const color = root.accentColor || "#8ab4ff";
          return (
            <li key={root.id} className="finproto-cat__group">
              <div className="finproto-cat__row">
                <button
                  type="button"
                  className="finproto-cat__expand"
                  aria-expanded={open}
                  aria-label={open ? t("fin.collapse") : t("fin.expand")}
                  onClick={() => toggleExpand(root.id)}
                >
                  {ch.length > 0 ? (open ? "▼" : "▶") : "·"}
                </button>
                <span
                  className="finproto-cat__ico"
                  style={{
                    background: `linear-gradient(145deg, ${color}33, ${color}18)`,
                    borderColor: `${color}55`,
                  }}
                >
                  {emoji}
                </span>
                <span className="finproto-cat__label">{root.name}</span>
                {!root.isBuiltIn ? (
                  <span className="finproto-cat__row-actions">
                    <button
                      type="button"
                      className="finproto-cat__link"
                      disabled={catBusy}
                      onClick={() => setSubFormParentId(root.id)}
                    >
                      {t("fin.subcategory")}
                    </button>
                    <button
                      type="button"
                      className="finproto-cat__link finproto-cat__link--muted"
                      disabled={catBusy}
                      onClick={() => onToggleArchive(root)}
                    >
                      {t("fin.archive")}
                    </button>
                  </span>
                ) : null}
              </div>
              {subFormParentId === root.id ? (
                <form
                  className="finproto-cat__subform"
                  onSubmit={(e) => void submitSub(e)}
                >
                  <span className="finproto-cat__subhint">
                    {t("fin.newSubIn", { name: root.name })}
                  </span>
                  <input
                    className="finance__input finproto-cat__subinput"
                    placeholder={t("fin.subNamePh")}
                    value={subName}
                    onChange={(e) => setSubName(e.target.value)}
                    maxLength={80}
                    autoFocus
                  />
                  <div className="finproto-cat__subactions">
                    <button type="submit" className="finance__submit" disabled={catBusy}>
                      {t("fin.add")}
                    </button>
                    <button
                      type="button"
                      className="finance__btn-secondary"
                      onClick={() => setSubFormParentId(null)}
                    >
                      {t("fin.cancel")}
                    </button>
                  </div>
                </form>
              ) : null}
              {open && ch.length > 0 ? (
                <ul className="finproto-cat__subs">
                  {ch.map((s) => {
                    const se = s.iconEmoji || "○";
                    const sc = s.accentColor || color;
                    return (
                      <li key={s.id} className="finproto-cat__sub">
                        <span
                          className="finproto-cat__ico finproto-cat__ico--sm"
                          style={{
                            background: `linear-gradient(145deg, ${sc}33, ${sc}18)`,
                            borderColor: `${sc}55`,
                          }}
                        >
                          {se}
                        </span>
                        <span>{s.name}</span>
                        {!s.isBuiltIn ? (
                          <button
                            type="button"
                            className="finproto-cat__link finproto-cat__link--muted"
                            disabled={catBusy}
                            onClick={() => onToggleArchive(s)}
                          >
                            {t("fin.archive")}
                          </button>
                        ) : null}
                      </li>
                    );
                  })}
                </ul>
              ) : null}
            </li>
          );
        })}
      </ul>

      <form className="finproto-cat__new" onSubmit={(e) => void submitRoot(e)}>
        <h3 className="finance__h3 finproto-cat__new-title">
          {tab === "EXPENSE"
            ? t("fin.newCategoryExpense")
            : t("fin.newCategoryIncome")}
        </h3>
        <input
          className="finance__input"
          placeholder={t("fin.categoryNamePh")}
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          maxLength={80}
        />
        <details ref={rootStyleDetailsRef} className="finproto-cat__details">
          <summary className="finproto-cat__details-sum">
            {t("fin.catIconColor")}
          </summary>
          <div className="finproto-cat__pickers">
            <div className="finproto-cat__emoji-bar">
              {CATEGORY_EMOJI_PRESETS.map((e, ei) => {
                const tint = tintColorForEmojiIndex(ei);
                return (
                  <button
                    key={e}
                    type="button"
                    className={
                      newEmoji === e
                        ? "finproto-cat__emoji finproto-cat__emoji--on"
                        : "finproto-cat__emoji"
                    }
                    style={{
                      borderColor: newEmoji === e ? tint : `${tint}66`,
                      background:
                        newEmoji === e
                          ? `linear-gradient(145deg, ${tint}44, ${tint}22)`
                          : `linear-gradient(145deg, ${tint}22, var(--rh-surface))`,
                    }}
                    onClick={() => setNewEmoji(e)}
                  >
                    {e}
                  </button>
                );
              })}
            </div>
            <div className="finproto-cat__colors">
              {CATEGORY_COLOR_PRESETS.map((c) => (
                <button
                  key={c}
                  type="button"
                  className={
                    newColor === c
                      ? "finproto-cat__dot finproto-cat__dot--on"
                      : "finproto-cat__dot"
                  }
                  style={{ background: c }}
                  onClick={() => setNewColor(c)}
                  aria-label={c}
                />
              ))}
            </div>
          </div>
        </details>
        <button className="finance__submit" type="submit" disabled={catBusy}>
          {t("fin.create")}
        </button>
      </form>
    </div>
  );
}
