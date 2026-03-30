import { createContext, useContext } from "react";

export type ShellTabContextValue = {
  /** Индекс активного слайда в AppShell (0 = Герой, 1 = Финансы, …). */
  activeIndex: number;
  /** Переключить карусель на вкладку по индексу (как нажатие на нижнюю навигацию). */
  goToTab: (index: number) => void;
};

const defaultValue: ShellTabContextValue = {
  activeIndex: 0,
  goToTab: () => {},
};

export const ShellTabContext = createContext<ShellTabContextValue>(defaultValue);

export function useShellTabIndex(): number {
  return useContext(ShellTabContext).activeIndex;
}

export function useShellGoToTab(): (index: number) => void {
  return useContext(ShellTabContext).goToTab;
}
