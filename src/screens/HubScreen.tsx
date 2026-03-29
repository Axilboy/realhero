import { useCallback, useEffect, useMemo, useState } from "react";
import {
  fetchAccounts,
  fetchInvestOverview,
  errorMessage as financeErrorMessage,
} from "../lib/financeApi";
import {
  fetchBodySettings,
  fetchNutritionDay,
  fetchMeasurements,
  fetchWorkouts,
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
import {
  consecutiveStreakFrom,
  measurementDateSet,
  workoutDatesFromCompleted,
  ymdToday,
} from "../lib/heroStreaks";
import { useShellGoToTab } from "../context/ShellTabContext";
import { SHELL_TAB } from "../lib/shellTabs";
import { useI18n } from "../i18n/I18nContext";
import { useAuth } from "../auth/AuthContext";

function pct(part: number, whole: number): number {
  if (whole <= 0) return 0;
  return Math.min(100, Math.round((part / whole) * 100));
}

function macroBarPct(cur: number, goal: number | null | undefined): number {
  if (goal == null || goal <= 0) return 0;
  return Math.min(100, Math.round((cur / goal) * 100));
}

export default function HubScreen() {
  const { t } = useI18n();
  const { user } = useAuth();
  const goToTab = useShellGoToTab();
  const [heroTotalExp, setHeroTotalExp] = useState<number>(
    () => loadHeroLocalState().totalExp,
  );
  const [loadError, setLoadError] = useState<string | null>(null);
  const [financeLine, setFinanceLine] = useState<string | null>(null);
  const [financeMiniLine, setFinanceMiniLine] = useState<string | null>(null);
  const [financePassiveLine, setFinancePassiveLine] = useState<string | null>(
    null,
  );
  const [bodyKcalLine, setBodyKcalLine] = useState<string | null>(null);
  const [bodyMacroLine, setBodyMacroLine] = useState<string | null>(null);
  const [questDefs, setQuestDefs] = useState<QuestDefinitionRow[]>([]);
  const [questInstances, setQuestInstances] = useState<QuestInstanceRow[]>([]);
  const [questStartBusy, setQuestStartBusy] = useState<string | null>(null);
  const [questAbandonBusy, setQuestAbandonBusy] = useState<string | null>(null);
  const [streakWorkout, setStreakWorkout] = useState(0);
  const [streakMeas, setStreakMeas] = useState(0);
  const [bodyBars, setBodyBars] = useState<{
    kcalPct: number;
    pPct: number;
    fPct: number;
    cPct: number;
  } | null>(null);
  const [bodyKcalHero, setBodyKcalHero] = useState<{
    cur: number;
    goal: number | null;
  } | null>(null);

  const displayName = (user?.email?.split("@")[0] ?? "").trim();

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

    const [acc, nut, st, ov, qDef, qInst, heroR, wR, mR] = await Promise.all([
      fetchAccounts(),
      fetchNutritionDay(today),
      fetchBodySettings(),
      fetchInvestOverview(false),
      fetchQuestDefinitions(),
      fetchQuestInstances(),
      fetchHero(),
      fetchWorkouts(400),
      fetchMeasurements(),
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
      const amountStr = formatRubFromMinor(grand);
      setFinanceLine(t("hub.financeTotal", { amount: amountStr }));
      setFinanceMiniLine(t("hub.financeMiniTotal", { amount: amountStr }));
    } else {
      setFinanceLine(null);
      setFinanceMiniLine(null);
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
      const goalKcal =
        st.ok && st.data.bodyKcalGoal != null && st.data.bodyKcalGoal > 0
          ? st.data.bodyKcalGoal
          : null;
      setBodyKcalHero({
        cur: Math.round(k.kcal),
        goal: goalKcal,
      });
      setBodyMacroLine(
        t("hub.macroLine", {
          p: Math.round(k.proteinG),
          f: Math.round(k.fatG),
          c: Math.round(k.carbG),
        }),
      );
    } else {
      setBodyKcalHero(null);
      setBodyMacroLine(null);
    }

    if (nut.ok && st.ok) {
      const k = nut.data.totals;
      const goal = st.data.bodyKcalGoal;
      const gP = st.data.bodyProteinGoalG;
      const gF = st.data.bodyFatGoalG;
      const gC = st.data.bodyCarbGoalG;
      setBodyBars({
        kcalPct: goal != null && goal > 0 ? pct(k.kcal, goal) : 0,
        pPct: macroBarPct(k.proteinG, gP),
        fPct: macroBarPct(k.fatG, gF),
        cPct: macroBarPct(k.carbG, gC),
      });
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
    } else if (nut.ok) {
      const k = nut.data.totals;
      setBodyBars({ kcalPct: 0, pPct: 0, fPct: 0, cPct: 0 });
      setBodyKcalLine(t("hub.kcalToday", { n: Math.round(k.kcal) }));
      if (!st.ok) errs.push(bodyErrorMessage(st.data));
    } else {
      setBodyBars(null);
      setBodyKcalLine(null);
      if (!nut.ok) errs.push(bodyErrorMessage(nut.data));
      if (!st.ok) errs.push(bodyErrorMessage(st.data));
    }

    if (wR.ok && "workouts" in wR.data) {
      const dates = workoutDatesFromCompleted(
        wR.data.workouts.map((x) => x.completedAt),
      );
      setStreakWorkout(consecutiveStreakFrom(dates, today));
    } else {
      setStreakWorkout(0);
    }

    if (mR.ok && "measurements" in mR.data) {
      const dates = measurementDateSet(
        mR.data.measurements.map((x) => x.date),
      );
      setStreakMeas(consecutiveStreakFrom(dates, today));
    } else {
      setStreakMeas(0);
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

  const barsForMini = bodyBars ?? {
    kcalPct: 0,
    pPct: 0,
    fPct: 0,
    cPct: 0,
  };

  return (
    <div className="screen hero">
      <section className="hero__panel" aria-labelledby="hero-game-heading">
        <h2 id="hero-game-heading" className="hero__sr-only">
          {t("hub.progressTitle")}
        </h2>
        <div className="hero__avatar-wrap">
          <div className="hero__avatar" aria-hidden>
            <span className="hero__avatar-icon">⚔</span>
          </div>
          <div className="hero__level-block">
            <p className="hero__level-word">
              {t("hub.levelWord", { n: level })}
            </p>
            <p className="hero__display-name">
              {displayName || "—"}
            </p>
            <p className="hero__epithet">{heroTitleForLevel}</p>
            <div className="hero__exp-row">
              <div
                className="hero__exp-bar"
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={expToNext}
                aria-valuenow={expInLevel}
                aria-label={t("hub.expAria", {
                  now: expInLevel,
                  max: expToNext,
                })}
              >
                <div
                  className="hero__exp-fill"
                  style={{ width: `${expPct}%` }}
                />
              </div>
              <span className="hero__exp-inline">
                {t("hub.expInline", { now: expInLevel, max: expToNext })}
              </span>
            </div>
            <p className="hero__exp-sync">{t("hub.expFootnote")}</p>
          </div>
        </div>
      </section>

      <section className="hero__streaks" aria-label={t("hub.streaksAria")}>
        <div className="hero__streak-chips hero__streak-chips--mockup">
          <span
            className="hero__chip hero__chip--fire"
            title={t("hub.workoutTitle")}
          >
            {t("hub.workoutChip", { n: streakWorkout })}
          </span>
          <span
            className="hero__chip hero__chip--meas"
            title={t("hub.measTitle")}
          >
            {t("hub.measChip", { n: streakMeas })}
          </span>
        </div>
      </section>

      <section className="hero__today" aria-labelledby="hero-today-h">
        <div className="hero__today-head">
          <h2 id="hero-today-h" className="hero__today-heading">
            {t("hub.today")}
          </h2>
          <button
            type="button"
            className="hero__today-link"
            onClick={() => goToTab(SHELL_TAB.TODO)}
          >
            {t("hub.todayLinkTodo")}
          </button>
        </div>
        <p className="hero__today-text">{t("hub.todayText")}</p>
        <div className="hero__today-actions hero__today-actions--mockup">
          <button
            type="button"
            className="hero__today-btn hero__today-btn--big"
            onClick={() => goToTab(SHELL_TAB.BODY)}
          >
            {t("hub.bodyBtnCaps")}
          </button>
          <button
            type="button"
            className="hero__today-btn hero__today-btn--big hero__today-btn--secondary"
            onClick={() => goToTab(SHELL_TAB.TODO)}
          >
            {t("hub.todoBtnCaps")}
          </button>
        </div>
      </section>

      <section className="hero__minigrid" aria-label={t("hub.minigridAria")}>
        <button
          type="button"
          className="hero__mini hero__mini--click hero__mini--body"
          onClick={() => goToTab(SHELL_TAB.BODY)}
        >
          <div className="hero__mini-top">
            <span className="hero__mini-ic" aria-hidden>
              🏋️
            </span>
            <span className="hero__mini-lbl">{t("hub.miniBody")}</span>
            <span className="hero__mini-ic hero__mini-ic--end" aria-hidden>
              🔥
            </span>
          </div>
          <div className="hero__kcal-track hero__kcal-track--blue" aria-hidden>
            <div
              className="hero__kcal-fill hero__kcal-fill--blue"
              style={{ width: `${barsForMini.kcalPct}%` }}
            />
          </div>
          <span className="hero__mini-kcal">
            {bodyKcalHero
              ? bodyKcalHero.goal != null && bodyKcalHero.goal > 0
                ? t("hub.kcalBig", {
                    cur: bodyKcalHero.cur,
                    goal: bodyKcalHero.goal,
                  })
                : t("hub.kcalBigNoGoal", { cur: bodyKcalHero.cur })
              : (bodyKcalLine ?? t("hub.kcalNoData"))}
          </span>
          <div className="hero__macro-bars" aria-hidden>
            <span className="hero__macro-track">
              <span
                className="hero__macro-bar hero__macro-bar--p"
                style={{ width: `${barsForMini.pPct}%` }}
              />
            </span>
            <span className="hero__macro-track">
              <span
                className="hero__macro-bar hero__macro-bar--f"
                style={{ width: `${barsForMini.fPct}%` }}
              />
            </span>
            <span className="hero__macro-track">
              <span
                className="hero__macro-bar hero__macro-bar--c"
                style={{ width: `${barsForMini.cPct}%` }}
              />
            </span>
          </div>
          {bodyMacroLine ? (
            <span className="hero__mini-sub">{bodyMacroLine}</span>
          ) : null}
        </button>
        <button
          type="button"
          className="hero__mini hero__mini--click hero__mini--finance"
          onClick={() => goToTab(SHELL_TAB.FINANCE)}
        >
          <div className="hero__mini-top">
            <span className="hero__mini-ic" aria-hidden>
              💰
            </span>
            <span className="hero__mini-lbl">{t("hub.miniFinance")}</span>
            <span className="hero__mini-ic hero__mini-ic--end" aria-hidden>
              📊
            </span>
          </div>
          <span className="hero__mini-value hero__mini-value--finance">
            {financeMiniLine ?? financeLine ?? t("hub.financeLoadFail")}
          </span>
          {financePassiveLine ? (
            <span className="hero__mini-sub hero__mini-sub--passive">
              {financePassiveLine}
            </span>
          ) : null}
        </button>
      </section>

      <section className="hero__card hero__card--quest" aria-labelledby="hero-quest-heading">
        <h2 id="hero-quest-heading" className="hero__card-title">
          {t("hub.quest")}
        </h2>
        {activeQuests.length === 0 ? (
          <p className="hero__card-text hero__card-text--muted hero__quest-lead">
            {t("hub.questText")}
          </p>
        ) : null}

        <h3 className="hero__quest-sub">{t("hub.questActive")}</h3>
        {activeQuests.length === 0 ? (
          <p className="hero__card-text hero__card-text--muted hero__quest-muted">
            {t("hub.questEmpty")}
          </p>
        ) : (
          <ul className="hero__quest-list">
            {activeQuests.map((q) => (
              <li key={q.id} className="hero__quest-item hero__quest-item--mockup">
                <div className="hero__quest-mockup-head">
                  <span className="hero__quest-name hero__quest-name--mockup">
                    {t("hub.questNameLine", { title: q.questTitle })}
                  </span>
                  <span className="hero__quest-progress hero__quest-progress--corner">
                    {t("hub.questProgressLabel", {
                      done: q.stepsDone,
                      total: q.stepsTotal,
                    })}
                  </span>
                </div>
                {branchLabel(q.branch) ? (
                  <span className="hero__quest-branch hero__quest-branch--below">
                    {branchLabel(q.branch)}
                  </span>
                ) : null}
                <div className="hero__quest-item-actions hero__quest-item-actions--mockup">
                  <button
                    type="button"
                    className="hero__btn hero__btn--small hero__btn--primary-mockup"
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
                  <span className="hero__quest-pick-title">
                    {t("hub.questNameLine", { title: d.title })}
                  </span>
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
