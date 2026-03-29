import { createContext, useContext } from "react";

/** Индекс активного слайда в AppShell (0 = Герой, 1 = Финансы, …). */
export const ShellTabIndexContext = createContext<number>(0);

export function useShellTabIndex(): number {
  return useContext(ShellTabIndexContext);
}
