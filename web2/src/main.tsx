import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { AuthProvider } from "./auth/AuthContext";
import { UiThemeProvider } from "./context/UiThemeContext";
import { I18nProvider } from "./i18n/I18nContext";
import App from "./App.tsx";
import "./index.css";
import "./finance-prototype.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <I18nProvider>
        <UiThemeProvider>
          <AuthProvider>
            <App />
          </AuthProvider>
        </UiThemeProvider>
      </I18nProvider>
    </BrowserRouter>
  </StrictMode>,
);
