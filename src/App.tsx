import { Navigate, Route, Routes } from "react-router-dom";
import { AppLayout } from "./components/AppLayout";
import { DashboardPage } from "./pages/DashboardPage";
import { FinancePage } from "./pages/FinancePage";
import { HealthPage } from "./pages/HealthPage";
import { KanbanPage } from "./pages/KanbanPage";
import { QuestsPage } from "./pages/QuestsPage";
import { ChangelogPage } from "./pages/ChangelogPage";
import { ApiProxyHintPage } from "./pages/ApiProxyHintPage";
import { LoginPage } from "./pages/LoginPage";
import { ProfilePage } from "./pages/ProfilePage";

export default function App() {
  return (
    <Routes>
      <Route path="login" element={<LoginPage />} />
      <Route path="api/*" element={<ApiProxyHintPage />} />
      <Route element={<AppLayout />}>
        <Route index element={<DashboardPage />} />
        <Route path="profile" element={<ProfilePage />} />
        <Route path="changelog" element={<ChangelogPage />} />
        <Route path="finance" element={<FinancePage />} />
        <Route path="health" element={<HealthPage />} />
        <Route path="quests" element={<QuestsPage />} />
        <Route path="kanban" element={<KanbanPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
