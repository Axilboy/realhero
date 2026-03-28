import { ModulePlaceholder } from "../components/ModulePlaceholder";

export function HealthPage() {
  return (
    <ModulePlaceholder
      title="Здоровье и фитнес"
      subtitle="Калории, тренировки, замеры — позже."
      directionHint="Свайп влево — вернуться на центр. Также «← Центр» или нижняя навигация."
      swipeModule="health"
    />
  );
}
