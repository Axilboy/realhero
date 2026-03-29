import { actionsEn, actionsRu } from "./actions";
import { bodyEn, bodyRu } from "./body";
import { commonEn, commonRu } from "./common";
import { financeEn, financeRu } from "./finance";
import { hubEn, hubRu } from "./hub";
import { todoEn, todoRu } from "./todo";

export const nestedRu = {
  ...commonRu,
  ...hubRu,
  ...actionsRu,
  ...bodyRu,
  ...todoRu,
  ...financeRu,
};

export const nestedEn = {
  ...commonEn,
  ...hubEn,
  ...actionsEn,
  ...bodyEn,
  ...todoEn,
  ...financeEn,
};
