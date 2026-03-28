import { useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";

const THRESHOLD = 56;

/**
 * Свайпы с главного экрана (дашборд):
 * влево → финансы, вправо → здоровье, вверх → канбан, вниз → квесты.
 */
export function useDashboardHomeSwipe(enabled: boolean) {
  const navigate = useNavigate();
  const start = useRef({ x: 0, y: 0 });

  const onTouchStart = useCallback((e: React.TouchEvent) => {
    const t = e.touches[0];
    start.current = { x: t.clientX, y: t.clientY };
  }, []);

  const onTouchEnd = useCallback(
    (e: React.TouchEvent) => {
      if (!enabled) return;
      const t = e.changedTouches[0];
      const dx = t.clientX - start.current.x;
      const dy = t.clientY - start.current.y;
      const ax = Math.abs(dx);
      const ay = Math.abs(dy);
      if (ax < THRESHOLD && ay < THRESHOLD) return;

      if (ax >= ay) {
        if (dx < 0) navigate("/finance");
        else navigate("/health");
      } else {
        if (dy < 0) navigate("/kanban");
        else navigate("/quests");
      }
    },
    [enabled, navigate]
  );

  return { onTouchStart, onTouchEnd };
}
