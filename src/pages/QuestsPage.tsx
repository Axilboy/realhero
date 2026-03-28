import { ModulePlaceholder } from "../components/ModulePlaceholder";

export function QuestsPage() {
  return (
    <ModulePlaceholder
      title="Квесты и привычки"
      subtitle="Рутины, EXP, награды — позже."
      directionHint="Свайп вверх — вернуться на центр. Также «← Центр» или нижняя навигация."
      swipeModule="quests"
    />
  );
}
