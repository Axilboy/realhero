import { type FormEvent, useCallback, useMemo } from "react";
import { type AccountRow, type Category } from "../../lib/financeApi";
import { formatRubFromMinor } from "../../lib/money";

export type AddOpTabProto = "expense" | "income" | "transfer";

type Props = {
  opTab: AddOpTabProto;
  amountStr: string;
  onAmountStr: (v: string) => void;
  amountDisplay: string;
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

function Keypad({
  onDigit,
  onComma,
  onBack,
  onOp,
}: {
  onDigit: (d: string) => void;
  onComma: () => void;
  onBack: () => void;
  onOp: (op: string) => void;
}) {
  const row = (keys: string[]) => (
    <div className="finproto-keypad__row">
      {keys.map((k) => (
        <button
          key={k}
          type="button"
          className="finproto-keypad__key"
          onClick={() => onDigit(k)}
        >
          {k}
        </button>
      ))}
    </div>
  );

  return (
    <div className="finproto-keypad">
      <div className="finproto-keypad__ops">
        {["+", "−", "×", "÷"].map((op) => (
          <button
            key={op}
            type="button"
            className="finproto-keypad__op"
            onClick={() => onOp(op)}
          >
            {op}
          </button>
        ))}
      </div>
      <div className="finproto-keypad__grid">
        {row(["1", "2", "3"])}
        {row(["4", "5", "6"])}
        {row(["7", "8", "9"])}
        <div className="finproto-keypad__row">
          <button
            type="button"
            className="finproto-keypad__key"
            onClick={onComma}
          >
            ,
          </button>
          <button
            type="button"
            className="finproto-keypad__key"
            onClick={() => onDigit("0")}
          >
            0
          </button>
          <button
            type="button"
            className="finproto-keypad__key finproto-keypad__key--ic"
            onClick={onBack}
            aria-label="Удалить"
          >
            ⌫
          </button>
        </div>
      </div>
    </div>
  );
}

export default function AddTransactionPrototype({
  opTab,
  amountStr,
  onAmountStr,
  amountDisplay,
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
  const append = useCallback(
    (ch: string) => {
      onAmountStr(amountStr + ch);
    },
    [amountStr, onAmountStr],
  );

  const onKeyOp = useCallback(
    (op: string) => {
      const map: Record<string, string> = {
        "+": "+",
        "−": "-",
        "×": "*",
        "÷": "/",
      };
      append(` ${map[op] ?? op} `);
    },
    [append],
  );

  const acc = accounts.find((a) => a.id === accountId);

  const catOptions = useMemo(() => {
    return categories.filter((c) => !c.isArchived);
  }, [categories]);

  const pickedCat = useMemo(
    () => catOptions.find((c) => c.id === pickCategoryId),
    [catOptions, pickCategoryId],
  );

  return (
    <div className="finproto-tx">
      <form
        className="finproto-tx__form"
        onSubmit={onSubmit}
        noValidate
      >
        <div className="finproto-tx__amount-box">
          <span
            className={
              opTab === "expense"
                ? "finproto-tx__amount finproto-tx__amount--out"
                : opTab === "income"
                  ? "finproto-tx__amount finproto-tx__amount--in"
                  : "finproto-tx__amount"
            }
          >
            {opTab === "expense" ? "− " : opTab === "income" ? "+ " : ""}
            {amountDisplay || "0"} ₽
          </span>
        </div>

        {opTab === "transfer" ? (
          <>
            <div className="finproto-tx__sub">Перевод между счетами</div>
            <div className="finproto-tx__acc-strip finproto-tx__acc-strip--tw">
              <span className="finproto-tx__tw-label">Откуда</span>
              {accounts.map((a) => (
                <button
                  key={`f-${a.id}`}
                  type="button"
                  className={
                    fromAccountId === a.id
                      ? "finproto-tx__acc-chip finproto-tx__acc-chip--on"
                      : "finproto-tx__acc-chip"
                  }
                  onClick={() => onFromAccountId(a.id)}
                >
                  {a.name}
                </button>
              ))}
            </div>
            <div className="finproto-tx__acc-strip finproto-tx__acc-strip--tw">
              <span className="finproto-tx__tw-label">Куда</span>
              {accounts.map((a) => (
                <button
                  key={`t-${a.id}`}
                  type="button"
                  className={
                    toAccountId === a.id
                      ? "finproto-tx__acc-chip finproto-tx__acc-chip--on"
                      : "finproto-tx__acc-chip"
                  }
                  onClick={() => onToAccountId(a.id)}
                >
                  {a.name}
                </button>
              ))}
            </div>
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
                <span className="finproto-tx__cat-ic" aria-hidden>
                  ⊘
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
                        {c.name}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </>
        )}

        {opTab !== "transfer" ? (
          <>
            <button type="button" className="finproto-tx__row">
              <span className="finproto-tx__row-k">Счёт</span>
              <span className="finproto-tx__row-v">
                <span className="finproto-tx__card-ic">💳</span>
                {acc ? `${accountLabel(acc)}` : "—"}
              </span>
            </button>

            <div className="finproto-tx__acc-strip">
              {accounts.map((a) => (
                <button
                  key={a.id}
                  type="button"
                  className={
                    accountId === a.id
                      ? "finproto-tx__acc-chip finproto-tx__acc-chip--on"
                      : "finproto-tx__acc-chip"
                  }
                  onClick={() => onAccountId(a.id)}
                >
                  <span className="finproto-tx__acc-n">{a.name}</span>
                  <span className="finproto-tx__acc-b">
                    {formatRubFromMinor(a.balanceMinor)}
                  </span>
                </button>
              ))}
            </div>
          </>
        ) : null}

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

        <Keypad
          onDigit={append}
          onComma={() => append(",")}
          onBack={() => onAmountStr(amountStr.slice(0, -1))}
          onOp={onKeyOp}
        />

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

