import { createContext, useContext } from "react";

export const LIGHT = {
  border: "#7a9db0",
  dark:   "#2d3f4a",
  cream:  "#f0ebe0",
  orange: "#e07b3a",
  gust:   "#c07a3a",
};

export const DARK = {
  border: "#7a9db0",
  dark:   "#c8c0b0",
  cream:  "#1a2635",
  orange: "#e8913e",
  gust:   "#d48840",
};

export const ThemeCtx = createContext(LIGHT);
export const useTheme = () => useContext(ThemeCtx);
