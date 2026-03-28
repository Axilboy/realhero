import { ModulePlaceholder } from "../components/ModulePlaceholder";

export function FinancePage() {
  return (
    <ModulePlaceholder
      title="Финансы"
      subtitle="Доходы, расходы, бюджеты — позже."
      directionHint="Свайп вправо — вернуться на центр. Также «← Центр» или нижняя навигация."
      swipeModule="finance"
    />
  );
}
