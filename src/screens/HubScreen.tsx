import { useCallback, useEffect, useMemo, useState } from "react";
import {
  fetchAccounts,
  fetchInvestOverview,
  errorMessage as financeErrorMessage,
} from "../lib/financeApi";
import {
  fetchBodySettings,
  fetchNutritionDay,
  errorMessage as bodyErrorMessage,
} from "../lib/bodyApi";
import { formatRubFromMinor } from "../lib/money";
import {
  loadHeroLocalState,
  saveHeroLocalState,
  splitTotalExp,
} from "../lib/heroLocalState";
import {
  fetchHero,
  syncHeroFromLocal,
  errorMessage as heroErrorMessage,
} from "../lib/heroApi";
import {
  fetchQuestDefinitions,
  fetchQuestInstances,
  startQuest,
  abandonQuest,
  errorMessage as questErrorMessage,
  type QuestDefinitionRow,
  type QuestInstanceRow,
} from "../lib/questApi";
import { ymdToday } from "../lib/heroStreaks";
import { useShellGoToTab } from "../context/ShellTabContext";
import { SHELL_TAB } from "../lib/shellTabs";
import { useI18n } from "../i18n/I18nContext";

function pct(part: number, whole: number): number {
  if (whole <= 0) return 0;
  return Math.min(100, Math.round((part / whole) * 100));
}

export default function HubScreen() {
  const { t } = useI18n();
  const goToTab = useShellGoToTab();
  const [heroTotalExp, setHeroTotalExp] = useState<number>(
    () => loadHeroLocalState().totalExp,
  );
  const [loadError, setLoadError] = useState<string | null>(null);
  const [financeLine, setFinanceLine] = useState<string | null>(null);
  const [financePassiveLine, setFinancePassiveLine] = useState<string | null>(
    null,
  );
  const [bodyKcalLine, setBodyKcalLine] = useState<string | null>(null);
  const [bodyMacroLine, setBodyMacroLine] = useState<string | null>(null);
  const [questDefs, setQuestDefs] = useState<QuestDefinitionRow[]>([]);
  const [questInstances, setQuestInstances] = useState<QuestInstanceRow[]>([]);
  const [questStartBusy, setQuestStartBusy] = useState<string | null>(null);
  const [questAbandonBusy, setQuestAbandonBusy] = useState<string | null>(null);

  const { level, expInLevel, expToNext } = useMemo(
    () => splitTotalExp(heroTotalExp),
    [heroTotalExp],
  );
  const expPct = expToNext > 0 ? pct(expInLevel, expToNext) : 100;

  const activeQuests = useMemo(
    () => questInstances.filter((i) => i.status === "ACTIVE"),
    [questInstances],
  );

  const availableQuests = useMemo(() => {
    const activeIds = new Set(
      questInstances
        .filter((i) => i.status === "ACTIVE")
        .map((i) => i.questId),
    );
    return questDefs.filter((d) => !activeIds.has(d.id));
  }, [questDefs, questInstances]);

  const branchLabel = useCallback(
    (b: QuestDefinitionRow["branch"] | null | undefined) => {
      switch (b) {
        case "tutorial":
          return t("hub.questBranchTutorial");
        case "gym":
          return t("hub.questBranchGym");
        case "health":
          return t("hub.questBranchHealth");
        case "beauty":
          return t("hub.questBranchBeauty");
        case "books":
          return t("hub.questBranchBooks");
        case "cinema":
          return t("hub.questBranchCinema");
        default:
          return "";
      }
    },
    [t],
  );

  const heroTitleForLevel = useMemo(() => {
    if (level < 3) return t("hub.titleNovice");
    if (level < 6) return t("hub.titleSeeker");
    if (level < 10) return t("hub.titleGuardian");
    if (level < 15) return t("hub.titleHero");
    return t("hub.titleLegend");
  }, [level, t]);

  const refreshHub = useCallback(async () => {
    setLoadError(null);
    const today = ymdToday();

    const [acc, nut, st, ov, qDef, qInst, heroR] = await Promise.all([
      fetchAccounts(),
      fetchNutritionDay(today),
      fetchBodySettings(),
      fetchInvestOverview(false),
      fetchQuestDefinitions(),
      fetchQuestInstances(),
      fetchHero(),
    ]);

    const errs: string[] = [];

    if (qDef.ok && "quests" in qDef.data) {
      setQuestDefs(qDef.data.quests);
    } else {
      setQuestDefs([]);
      if (!qDef.ok) errs.push(questErrorMessage(qDef.data));
    }

    if (qInst.ok && "instances" in qInst.data) {
      setQuestInstances(qInst.data.instances);
    } else {
      setQuestInstances([]);
      if (!qInst.ok) errs.push(questErrorMessage(qInst.data));
    }

    if (heroR.ok && "totalExp" in heroR.data) {
      const te = heroR.data.totalExp;
      saveHeroLocalState({ totalExp: te });
      setHeroTotalExp(te);
    } else if (!heroR.ok) {
      errs.push(heroErrorMessage(heroR.data));
    }
    if (acc.ok) {
      const sumAcc = acc.data.accounts.reduce((s, a) => s + a.balanceMinor, 0);
      const inv = acc.data.investmentsTotalMinor;
      const grand = sumAcc + inv;
      setFinanceLine(
        t("hub.financeTotal", { amount: formatRubFromMinor(grand) }),
      );
    } else {
      setFinanceLine(null);
      setFinancePassiveLine(null);
      errs.push(financeErrorMessage(acc.data));
    }

    if (acc.ok && ov.ok) {
      const dep = ov.data.metrics.depositSavingsIncomeMonthMinor;
      const sec = ov.data.metrics.couponDividendMonthMinor ?? 0;
      const passive = dep + sec;
      setFinancePassiveLine(
        passive > 0
          ? t("hub.financePassive", {
              amount: formatRubFromMinor(passive),
            })
          : null,
      );
    } else if (acc.ok) {
      setFinancePassiveLine(null);
    }

    if (nut.ok) {
      const k = nut.data.totals;
      setBodyMacroLine(
        t("hub.macroLine", {
          p: Math.round(k.proteinG),
          f: Math.round(k.fatG),
          c: Math.round(k.carbG),
        }),
      );
    } else {
      setBodyMacroLine(null);
    }

    if (nut.ok && st.ok) {
      const k = nut.data.totals;
      const goal = st.data.bodyKcalGoal;
      if (goal != null && goal > 0) {
        setBodyKcalLine(
          t("hub.kcalRatio", {
            cur: Math.round(k.kcal),
            goal,
            pct: pct(k.kcal, goal),
          }),
        );
      } else {
        setBodyKcalLine(t("hub.kcalToday", { n: Math.round(k.kcal) }));
      }
    } else {
      setBodyKcalLine(null);
      if (!nut.ok) errs.push(bodyErrorMessage(nut.data));
      if (!st.ok) errs.push(bodyErrorMessage(st.data));
    }

    if (errs.length) setLoadError(errs[0] ?? null);
  }, [t]);

  const handleStartQuest = useCallback(
    async (questId: string) => {
      setQuestStartBusy(questId);
      setLoadError(null);
      try {
        const r = await startQuest(questId);
        if (!r.ok) {
          setLoadError(questErrorMessage(r.data));
          return;
        }
        await refreshHub();
      } finally {
        setQuestStartBusy(null);
      }
    },
    [refreshHub],
  );

  const handleAbandonQuest = useCallback(
    async (instanceId: string) => {
      setQuestAbandonBusy(instanceId);
      setLoadError(null);
      try {
        const r = await abandonQuest(instanceId);
        if (!r.ok) {
          setLoadError(questErrorMessage(r.data));
          return;
        }
        await refreshHub();
      } finally {
        setQuestAbandonBusy(null);
      }
    },
    [refreshHub],
  );

  useEffect(() => {
    void refreshHub();
  }, [refreshHub]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const local = loadHeroLocalState();
      const r = await fetchHero();
      if (cancelled) return;
      if (!r.ok || !("totalExp" in r.data)) {
        setHeroTotalExp(local.totalExp);
        if (!r.ok) {
          setLoadError((prev) => prev ?? heroErrorMessage(r.data));
        }
        return;
      }
      let total = r.data.totalExp;
      if (local.totalExp > total) {
        const s = await syncHeroFromLocal(local.totalExp);
        if (cancelled) return;
        if (s.ok && "totalExp" in s.data) {
          total = s.data.totalExp;
        } else {
          total = Math.max(total, local.totalExp);
        }
      } else {
        total = Math.max(total, local.totalExp);
      }
      saveHeroLocalState({ totalExp: total });
      setHeroTotalExp(total);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="screen hero">
      <p className="screen__badge">{t("hub.badge")}</p>
      <h1 className="screen__title hero__title">{t("hub.title")}</h1>

      <section className="hero__panel" aria-labelledby="hero-game-heading">
        <h2 id="hero-game-heading" className="hero__sr-only">
          {t("hub.progressTitle")}
        </h2>
        <div className="hero__avatar-wrap">
          <div className="hero__avatar" aria-hidden>
            <span className="hero__avatar-icon">⚔</span>
          </div>
          <div className="hero__level-block">
            <div className="hero__level-row">
              <span className="hero__level-num">
                {t("hub.levelShort")} {level}
              </span>
              <span className="hero__level-title">{heroTitleForLevel}</span>
            </div>
            <div
              className="hero__exp-bar"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={expToNext}
              aria-valuenow={expInLevel}
              aria-label={t("hub.expAria", { now: expInLevel, max: expToNext })}
            >
              <div className="hero__exp-fill" style={{ width: `${expPct}%` }} />
            </div>
            <p className="hero__exp-caption">
              EXP {expInLevel} / {expToNext}
              <span className="hero__exp-hint">{t("hub.expHint")}</span>
            </p>
          </div>
        </div>
      </section>

      <section className="hero__minigrid" aria-label={t("hub.minigridAria")}>
        <button
          type="button"
          className="hero__mini hero__mini--click"
          onClick={() => goToTab(SHELL_TAB.BODY)}
        >
          <span className="hero__mini-label">{t("hub.miniBody")}</span>
          <span className="hero__mini-value">
            {bodyKcalLine ?? t("hub.kcalNoData")}
          </span>
          {bodyMacroLine ? (
            <span className="hero__mini-sub">{bodyMacroLine}</span>
          ) : null}
        </button>
        <button
          type="button"
          className="hero__mini hero__mini--click"
          onClick={() => goToTab(SHELL_TAB.FINANCE)}
        >
          <span className="hero__mini-label">{t("hub.miniFinance")}</span>
          <span className="hero__mini-value">
            {financeLine ?? t("hub.financeLoadFail")}
          </span>
          {financePassiveLine ? (
            <span className="hero__mini-sub">{financePassiveLine}</span>
          ) : null}
        </button>
      </section>

      <section className="hero__card hero__card--quest" aria-labelledby="hero-quest-heading">
        <h2 id="hero-quest-heading" className="hero__card-title">
          {t("hub.quest")}
        </h2>
        <p className="hero__card-text hero__card-text--muted">
          {t("hub.questText")}
        </p>

        <h3 className="hero__quest-sub">{t("hub.questActive")}</h3>
        {activeQuests.length === 0 ? (
          <p className="hero__card-text hero__card-text--muted hero__quest-muted">
            {t("hub.questEmpty")}
          </p>
        ) : (
          <ul className="hero__quest-list">
            {activeQuests.map((q) => (
              <li key={q.id} className="hero__quest-item">
                <div className="hero__quest-item-head">
                  <span className="hero__quest-branch">
                    {branchLabel(q.branch)}
                  </span>
                  <span className="hero__quest-name">{q.questTitle}</span>
                </div>
                <div className="hero__quest-item-row">
                  <span className="hero__quest-progress">
                    {t("hub.questStepsProgress", {
                      done: q.stepsDone,
                      total: q.stepsTotal,
                    })}
                  </span>
                  <div className="hero__quest-item-actions">
                    <button
                      type="button"
                      className="hero__btn hero__btn--small"
                      onClick={() => goToTab(SHELL_TAB.TODO)}
                    >
                      {t("hub.questToTodo")}
                    </button>
                    <button
                      type="button"
                      className="hero__btn hero__btn--ghost"
                      disabled={questAbandonBusy === q.id}
                      onClick={() => void handleAbandonQuest(q.id)}
                    >
                      {t("hub.questAbandon")}
                    </button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}

        <h3 className="hero__quest-sub">{t("hub.questAvailable")}</h3>
        {availableQuests.length === 0 ? (
          <p className="hero__card-text hero__card-text--muted hero__quest-muted">
            {activeQuests.length > 0
              ? t("hub.questAllActive")
              : t("hub.questEmpty")}
          </p>
        ) : (
          <ul className="hero__quest-list hero__quest-list--pick">
            {availableQuests.map((d) => (
              <li key={d.id} className="hero__quest-pick">
                <div className="hero__quest-pick-main">
                  <span className="hero__quest-branch">
                    {branchLabel(d.branch)}
                  </span>
                  <span className="hero__quest-pick-title">{d.title}</span>
                  <span className="hero__quest-pick-desc">{d.description}</span>
                  <span className="hero__quest-pick-xp">
                    {t("hub.questXpTotal", { n: d.rewardXpTotal })}
                  </span>
                </div>
                <button
                  type="button"
                  className="hero__btn hero__btn--primary hero__btn--small"
                  disabled={questStartBusy === d.id}
                  onClick={() => void handleStartQuest(d.id)}
                >
                  {t("hub.questStart")}
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="hero__future" aria-label={t("hub.futureAria")}>
        <span className="hero__future-label">{t("hub.futureLabel")}</span>
        <div className="hero__future-btns">
          <button type="button" className="hero__icon-btn" disabled title={t("hub.futureInventory")}>
            🎒
          </button>
          <button type="button" className="hero__icon-btn" disabled title={t("hub.futurePet")}>
            🐾
          </button>
          <button type="button" className="hero__icon-btn" disabled title={t("hub.futureGame")}>
            🎮
          </button>
        </div>
      </section>

      {loadError ? (
        <p className="hero__warn" role="status">
          {loadError}
        </p>
      ) : null}
    </div>
  );
}
