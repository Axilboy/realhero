import { apiFetch, errorMessage } from "./financeApi";

export { errorMessage };

async function j<T>(
  path: string,
  init?: RequestInit,
): Promise<{ ok: boolean; status: number; data: T }> {
  const res = await apiFetch(path, init);
  const text = await res.text();
  let data = {} as T;
  if (text) {
    try {
      data = JSON.parse(text) as T;
    } catch {
      if (!res.ok) {
        data = {
          error: {
            message:
              text.length > 200 ? `${text.slice(0, 200)}…` : text || res.statusText,
          },
        } as T;
      }
    }
  } else if (!res.ok) {
    data = { error: { message: res.statusText || `HTTP ${res.status}` } } as T;
  }
  return { ok: res.ok, status: res.status, data };
}

export type BodyMassUnit = "KG" | "LB";
export type BodyLengthUnit = "CM" | "IN";
export type MealSlot = "BREAKFAST" | "LUNCH" | "DINNER" | "SNACK";
export type ExerciseKind =
  | "STRENGTH"
  | "CARDIO"
  | "STRETCH"
  | "WARMUP"
  | "OTHER";

export type BodySettings = {
  bodyMassUnit: BodyMassUnit;
  bodyLengthUnit: BodyLengthUnit;
  bodyKcalGoal: number | null;
  bodyProteinGoalG: number | null;
  bodyFatGoalG: number | null;
  bodyCarbGoalG: number | null;
};

export type BodyMeasurementRow = {
  id: string;
  userId: string;
  date: string;
  weightKg: number | null;
  heightCm: number | null;
  bodyFatPct: number | null;
  waistCm: number | null;
  hipCm: number | null;
  chestCm: number | null;
  bicepCm: number | null;
  thighCm: number | null;
  calfCm: number | null;
  neckCm: number | null;
  note: string | null;
  createdAt: string;
  updatedAt: string;
};

export type NutritionEntryRow = {
  id: string;
  userId: string;
  date: string;
  mealSlot: MealSlot;
  sortOrder: number;
  name: string;
  portionG: number | null;
  kcal: number;
  proteinG: number;
  fatG: number;
  carbG: number;
  createdAt: string;
  updatedAt: string;
};

/** КБЖУ на 100 г (Open Food Facts или свой справочник). */
export type FoodNutrition100 = {
  name: string;
  brand: string | null;
  kcal100: number;
  protein100: number;
  fat100: number;
  carb100: number;
  code: string | null;
};

export type UserFoodRow = {
  id: string;
  userId: string;
  name: string;
  kcal: number;
  proteinG: number;
  fatG: number;
  carbG: number;
  note: string | null;
  createdAt: string;
  updatedAt: string;
};

export type TrainingExerciseRow = {
  id: string;
  dayId: string;
  sortOrder: number;
  name: string;
  kind: ExerciseKind;
  sets: number | null;
  reps: number | null;
  weightKg: number | null;
  durationSec: number | null;
  distanceM: number | null;
  restSec: number | null;
  notes: string | null;
};

export type TrainingDayRow = {
  id: string;
  programId: string;
  dayIndex: number;
  name: string | null;
  exercises: TrainingExerciseRow[];
};

export type TrainingProgramRow = {
  id: string;
  userId: string;
  name: string;
  notes: string | null;
  sortOrder: number;
  days: TrainingDayRow[];
  createdAt: string;
  updatedAt: string;
};

export type WorkoutLogLineRow = {
  id: string;
  logId: string;
  sortOrder: number;
  name: string;
  kind: ExerciseKind;
  notes: string | null;
  resultJson: string;
};

export type WorkoutLogRow = {
  id: string;
  userId: string;
  programId: string | null;
  trainingDayId: string | null;
  startedAt: string;
  completedAt: string | null;
  note: string | null;
  createdAt: string;
  updatedAt: string;
  program?: { id: string; name: string } | null;
  trainingDay?: TrainingDayRow | null;
  lines?: WorkoutLogLineRow[];
};

export async function fetchBodySettings() {
  return j<BodySettings>("/api/v1/body/settings");
}

export async function patchBodySettings(payload: Partial<BodySettings>) {
  return j<BodySettings>("/api/v1/body/settings", {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export async function fetchMeasurements(q?: { from?: string; to?: string }) {
  const sp = new URLSearchParams();
  if (q?.from) sp.set("from", q.from);
  if (q?.to) sp.set("to", q.to);
  const qs = sp.toString();
  return j<{ measurements: BodyMeasurementRow[] }>(
    `/api/v1/body/measurements${qs ? `?${qs}` : ""}`,
  );
}

export async function createMeasurement(payload: Partial<BodyMeasurementRow> & { date: string }) {
  return j<{ measurement: BodyMeasurementRow }>("/api/v1/body/measurements", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function patchMeasurement(
  id: string,
  payload: Partial<BodyMeasurementRow>,
) {
  return j<{ measurement: BodyMeasurementRow }>(
    `/api/v1/body/measurements/${id}`,
    { method: "PATCH", body: JSON.stringify(payload) },
  );
}

export async function deleteMeasurement(id: string) {
  return j<{ ok: boolean }>(`/api/v1/body/measurements/${id}`, {
    method: "DELETE",
  });
}

export async function fetchNutritionDay(date: string) {
  return j<{
    date: string;
    entries: NutritionEntryRow[];
    totals: { kcal: number; proteinG: number; fatG: number; carbG: number };
  }>(`/api/v1/body/nutrition/day/${encodeURIComponent(date)}`);
}

export async function searchFoodProducts(q: string) {
  return j<{ products: FoodNutrition100[] }>(
    `/api/v1/body/food/search?q=${encodeURIComponent(q)}`,
  );
}

export async function fetchFoodByBarcode(code: string) {
  const clean = code.replace(/\D/g, "") || code;
  return j<{ product: FoodNutrition100 }>(
    `/api/v1/body/food/barcode/${encodeURIComponent(clean)}`,
  );
}

export async function fetchUserFoods() {
  return j<{ foods: UserFoodRow[] }>("/api/v1/body/user-foods");
}

export async function createUserFood(payload: {
  name: string;
  kcal: number;
  proteinG: number;
  fatG: number;
  carbG: number;
  note?: string | null;
}) {
  return j<{ food: UserFoodRow }>("/api/v1/body/user-foods", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function patchUserFood(
  id: string,
  payload: Partial<{
    name: string;
    kcal: number;
    proteinG: number;
    fatG: number;
    carbG: number;
    note: string | null;
  }>,
) {
  return j<{ food: UserFoodRow }>(`/api/v1/body/user-foods/${id}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export async function deleteUserFood(id: string) {
  return j<{ ok: boolean }>(`/api/v1/body/user-foods/${id}`, { method: "DELETE" });
}

export async function createNutritionEntry(payload: {
  date: string;
  mealSlot: MealSlot;
  name: string;
  portionG?: number | null;
  kcal: number;
  proteinG?: number;
  fatG?: number;
  carbG?: number;
}) {
  return j<{ entry: NutritionEntryRow }>("/api/v1/body/nutrition/entries", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function patchNutritionEntry(
  id: string,
  payload: Partial<{
    mealSlot: MealSlot;
    name: string;
    portionG: number | null;
    kcal: number;
    proteinG: number;
    fatG: number;
    carbG: number;
  }>,
) {
  return j<{ entry: NutritionEntryRow }>(`/api/v1/body/nutrition/entries/${id}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export async function deleteNutritionEntry(id: string) {
  return j<{ ok: boolean }>(`/api/v1/body/nutrition/entries/${id}`, {
    method: "DELETE",
  });
}

export async function fetchPrograms() {
  return j<{ programs: TrainingProgramRow[] }>("/api/v1/body/programs");
}

export async function createProgram(payload: { name: string; notes?: string | null }) {
  return j<{ program: TrainingProgramRow }>("/api/v1/body/programs", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function deleteProgram(id: string) {
  return j<{ ok: boolean }>(`/api/v1/body/programs/${id}`, { method: "DELETE" });
}

export async function createTrainingDay(
  programId: string,
  payload: { dayIndex: number; name?: string | null },
) {
  return j<{ day: TrainingDayRow }>(`/api/v1/body/programs/${programId}/days`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function createTrainingExercise(
  dayId: string,
  payload: {
    name: string;
    kind: ExerciseKind;
    sets?: number | null;
    reps?: number | null;
    weightKg?: number | null;
    durationSec?: number | null;
    distanceM?: number | null;
    restSec?: number | null;
    notes?: string | null;
  },
) {
  return j<{ exercise: TrainingExerciseRow }>(
    `/api/v1/body/training-days/${dayId}/exercises`,
    { method: "POST", body: JSON.stringify(payload) },
  );
}

export async function deleteTrainingExercise(id: string) {
  return j<{ ok: boolean }>(`/api/v1/body/training-exercises/${id}`, {
    method: "DELETE",
  });
}

export async function fetchWorkouts(limit?: number) {
  const q = limit ? `?limit=${limit}` : "";
  return j<{ workouts: WorkoutLogRow[] }>(`/api/v1/body/workouts${q}`);
}

export async function createWorkout(payload: {
  programId?: string | null;
  trainingDayId?: string | null;
  startedAt?: string;
  completed?: boolean;
  note?: string | null;
}) {
  return j<{ workout: WorkoutLogRow }>("/api/v1/body/workouts", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function patchWorkout(
  id: string,
  payload: { completed?: boolean; completedAt?: string | null; note?: string | null },
) {
  return j<{ workout: WorkoutLogRow }>(`/api/v1/body/workouts/${id}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export async function addWorkoutLine(
  workoutId: string,
  payload: {
    name: string;
    kind: ExerciseKind;
    resultJson: string | object;
    notes?: string | null;
  },
) {
  const body =
    typeof payload.resultJson === "string"
      ? payload
      : { ...payload, resultJson: JSON.stringify(payload.resultJson) };
  return j<{ line: WorkoutLogLineRow }>(
    `/api/v1/body/workouts/${workoutId}/lines`,
    { method: "POST", body: JSON.stringify(body) },
  );
}
