import { ModulePlaceholder } from "../components/ModulePlaceholder";

export function KanbanPage() {
  return (
    <ModulePlaceholder
      title="Канбан"
      subtitle="Доски в духе Trello — позже."
      directionHint="Свайп вниз — вернуться на центр. Также «← Центр» или нижняя навигация."
      swipeModule="kanban"
    />
  );
}
