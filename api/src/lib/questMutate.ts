const TITLE_MIN = 1;
const TITLE_MAX = 200;
const EXP_MIN = 1;
const EXP_MAX = 500;
const COINS_MIN = 0;
const COINS_MAX = 1000;

export type QuestMutateFields = {
  title?: string;
  rewardExp?: number;
  rewardCoins?: number;
};

export function parseQuestMutate(
  body: Record<string, unknown> | undefined,
  requireTitle: boolean
): { ok: false; error: string } | { ok: true; fields: QuestMutateFields } {
  if (!body || typeof body !== "object") {
    return { ok: false, error: "invalid_body" };
  }
  const fields: QuestMutateFields = {};

  if ("title" in body) {
    if (typeof body.title !== "string") return { ok: false, error: "invalid_title" };
    const title = body.title.trim();
    if (title.length < TITLE_MIN || title.length > TITLE_MAX) {
      return { ok: false, error: "invalid_title" };
    }
    fields.title = title;
  } else if (requireTitle) {
    return { ok: false, error: "invalid_title" };
  }

  if ("rewardExp" in body) {
    const v = body.rewardExp;
    if (typeof v !== "number" || !Number.isInteger(v)) return { ok: false, error: "invalid_reward_exp" };
    if (v < EXP_MIN || v > EXP_MAX) return { ok: false, error: "invalid_reward_exp" };
    fields.rewardExp = v;
  }

  if ("rewardCoins" in body) {
    const v = body.rewardCoins;
    if (typeof v !== "number" || !Number.isInteger(v)) return { ok: false, error: "invalid_reward_coins" };
    if (v < COINS_MIN || v > COINS_MAX) return { ok: false, error: "invalid_reward_coins" };
    fields.rewardCoins = v;
  }

  if (requireTitle && !fields.title) return { ok: false, error: "invalid_title" };
  if (!requireTitle && Object.keys(fields).length === 0) {
    return { ok: false, error: "no_fields" };
  }

  return { ok: true, fields };
}
