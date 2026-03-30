import { type FormEvent, useMemo } from "react";
import {
  type AccountRow,
  type Category,
  UNIVERSAL_CATEGORY_NAME,
  categoryNameForUi,
} from "../../lib/financeApi";
import { formatRubFromMinor } from "../../lib/money";

export type AddOpTabProto = "expense" | "income" | "transfer";

type Props = {
  opTab: AddOpTabProto;
  amountStr: string;
  onAmountStr: (v: string) => void;
  accounts: AccountRow[];
  accountId: string;
  onAccountId: (id: string) => void;
  accountLabel: (a: AccountRow) => string;
  fromAccountId: string;
  toAccountId: string;
  onFromAccountId: (id: string) => void;
  onToAccountId: (id: string) => void;
  categoryLabel: string;
  onOpenCategoryPicker: () => void;
  occurredDate: string;
  onOccurredDate: (v: string) => void;
  note: string;
  onNote: (v: string) => void;
  onSubmit: (e: FormEvent) => void;
  formBusy: boolean;
  formError: string | null;
  canSubmit: boolean;
  categories: Category[];
  pickCategoryId: string;
  onPickCategoryId: (id: string) => void;
  showCategoryPicker: boolean;
  onCloseCategoryPicker: () => void;
};

export default function AddTransactionPrototype({
  opTab,
  amountStr,
  onAmountStr,
  accounts,
  accountId,
  onAccountId,
  accountLabel,
  fromAccountId,
  toAccountId,
  onFromAccountId,
  onToAccountId,
  categoryLabel,
  onOpenCategoryPicker,
  occurredDate,
  onOccurredDate,
  note,
  onNote,
  onSubmit,
  formBusy,
  formError,
  canSubmit,
  categories,
  pickCategoryId,
  onPickCategoryId,
  showCategoryPicker,
  onCloseCategoryPicker,
}: Props) {
  const catOptions = useMemo(() => {
    return categories.filter((c) => !c.isArchived);
  }, [categories]);

  const pickedCat = useMemo(
    () => catOptions.find((c) => c.id === pickCategoryId),
    [catOptions, pickCategoryId],
  );

  const amountPrefix =
    opTab === "expense" ? "− " : opTab === "income" ? "+ " : "";

  return (
    <div className="finproto-tx">
      <form className="finproto-tx__form" onSubmit={onSubmit} noValidate>
        <div className="finproto-tx__amount-box">
          <label className="finproto-tx__amount-field">
            <span
              className={
                opTab === "expense"
                  ? "finproto-tx__amount-prefix finproto-tx__amount-prefix--out"
                  : opTab === "income"
                    ? "finproto-tx__amount-prefix finproto-tx__amount-prefix--in"
                    : "finproto-tx__amount-prefix"
              }
              aria-hidden={opTab === "transfer"}
            >
              {amountPrefix}
            </span>
            <input
              className="finproto-tx__amount-input"
              type="text"
              inputMode="decimal"
              name="amount"
              autoComplete="off"
              placeholder="0"
              value={amountStr}
              onChange={(e) => onAmountStr(e.target.value)}
            />
            <span className="finproto-tx__amount-suffix">₽</span>
          </label>
        </div>

        {opTab === "transfer" ? (
          <>
            <div className="finproto-tx__sub">Перевод между счетами</div>
            <label className="finproto-tx__row finproto-tx__row--field">
              <span className="finproto-tx__row-k">Откуда</span>
              <select
                className="finproto-tx__select"
                value={fromAccountId}
                onChange={(e) => onFromAccountId(e.target.value)}
              >
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {accountLabel(a)} — {formatRubFromMinor(a.balanceMinor)}
                  </option>
                ))}
              </select>
            </label>
            <label className="finproto-tx__row finproto-tx__row--field">
              <span className="finproto-tx__row-k">Куда</span>
              <select
                className="finproto-tx__select"
                value={toAccountId}
                onChange={(e) => onToAccountId(e.target.value)}
              >
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {accountLabel(a)} — {formatRubFromMinor(a.balanceMinor)}
                  </option>
                ))}
              </select>
            </label>
          </>
        ) : (
          <>
            <button
              type="button"
              className="finproto-tx__row"
              onClick={onOpenCategoryPicker}
            >
              <span className="finproto-tx__row-k">Категория</span>
              <span className="finproto-tx__row-v">
                <span
                  className="finproto-tx__cat-ic"
                  aria-hidden
                  style={
                    pickedCat?.accentColor
                      ? {
                          borderColor: `${pickedCat.accentColor}88`,
                          background: `linear-gradient(145deg, ${pickedCat.accentColor}40, ${pickedCat.accentColor}18)`,
                          opacity: 1,
                        }
                      : undefined
                  }
                >
                  {pickedCat?.iconEmoji ?? "⊘"}
                </span>
                {categoryLabel}
              </span>
            </button>

            {showCategoryPicker ? (
              <div
                className="finproto-tx__picker"
                role="dialog"
                aria-label="Категория"
              >
                <div className="finproto-tx__picker-head">
                  <span>Выберите категорию</span>
                  <button
                    type="button"
                    className="finproto-tx__picker-close"
                    onClick={onCloseCategoryPicker}
                  >
                    ✕
                  </button>
                </div>
                <ul className="finproto-tx__picker-list">
                  {catOptions.map((c) => (
                    <li key={c.id}>
                      <button
                        type="button"
                        className={
                          pickCategoryId === c.id
                            ? "finproto-tx__pick finproto-tx__pick--on"
                            : "finproto-tx__pick"
                        }
                        onClick={() => {
                          onPickCategoryId(c.id);
                          onCloseCategoryPicker();
                        }}
                      >
                        <span
                          className="finproto-tx__pick-ico"
                          style={{
                            borderColor: c.accentColor || "#555",
                            background: `${c.accentColor || "#555"}22`,
                          }}
                        >
                          {c.iconEmoji || "◆"}
                        </span>
                        {categoryNameForUi(c.name)}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            <label className="finproto-tx__row finproto-tx__row--field">
              <span className="finproto-tx__row-k">Счёт</span>
              <select
                className="finproto-tx__select"
                value={accountId}
                onChange={(e) => onAccountId(e.target.value)}
                disabled={accounts.length === 0}
              >
                {accounts.length === 0 ? (
                  <option value="">Нет счетов</option>
                ) : (
                  accounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {accountLabel(a)} — {formatRubFromMinor(a.balanceMinor)}
                    </option>
                  ))
                )}
              </select>
            </label>
          </>
        )}

        <label className="finproto-tx__row finproto-tx__row--field">
          <span className="finproto-tx__row-k">Дата</span>
          <input
            className="finproto-tx__date"
            type="date"
            value={occurredDate}
            onChange={(e) => onOccurredDate(e.target.value)}
          />
        </label>

        <label className="finproto-tx__row finproto-tx__row--field">
          <span className="finproto-tx__row-k">Примечание</span>
          <input
            className="finproto-tx__note"
            type="text"
            maxLength={500}
            value={note}
            onChange={(e) => onNote(e.target.value)}
            placeholder="Необязательно"
          />
        </label>

        {formError ? <p className="finance__err">{formError}</p> : null}

        <button
          className="finance__submit"
          type="submit"
          disabled={formBusy || !canSubmit}
        >
          {formBusy ? "…" : "Добавить"}
        </button>
      </form>
    </div>
  );
}
