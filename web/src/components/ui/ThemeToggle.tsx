import { StateIconButton } from "../ui_primitives";
import { useColorScheme } from "@mui/material/styles";
import { LightMode, DarkMode } from "@mui/icons-material";
import { memo, useCallback } from "react";
import { useTranslation } from "react-i18next";

export const ThemeToggle = memo(function ThemeToggle() {
  const { t } = useTranslation("navigation");
  const { mode, setMode } = useColorScheme();

  const toggleTheme = useCallback(() => {
    const newMode = mode === "dark" ? "light" : "dark";
    setMode(newMode);
  }, [mode, setMode]);

  // Don't render until we have the mode
  if (!mode) {
    return null;
  }

  return (
    <StateIconButton
      icon={mode === "dark" ? <LightMode /> : <DarkMode />}
      tooltip={
        mode === "dark" ? t("switchToLightMode") : t("switchToDarkMode")
      }
      onClick={toggleTheme}
      size="small"
      color="default"
      sx={{
        marginLeft: 1,
        scale: 0.85,
        color: "var(--palette-text-primary)",
        border: `1px solid var(--palette-grey-600)`
      }}
    />
  );
});

ThemeToggle.displayName = "ThemeToggle";

export default ThemeToggle;
