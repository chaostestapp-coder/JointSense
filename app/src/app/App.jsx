import "./App.css";
import { BrowserRouter, Route, Routes } from "react-router";
import CursorSpotlight from "../components/common/CursorSpotlight";
import ProtectedRoute from "../components/common/ProtectedRoute";
import AppShell from "../components/layout/AppShell";
import { AuthProvider } from "../context/AuthContext";
import { LanguageProvider } from "../context/LanguageContext";
import DashboardPage from "../pages/DashboardPage";
import LoginPage from "../pages/LoginPage";
import NotFoundPage from "../pages/NotFoundPage";
import PatientDetailsPage from "../pages/PatientDetailsPage";
import PatientsPage from "../pages/PatientsPage";
import ScreeningPage from "../pages/ScreeningPage";
import ScreeningResultPage from "../pages/ScreeningResultPage";
import SettingsPage from "../pages/SettingsPage";

const App = () => {
  return (
    <LanguageProvider>
      <AuthProvider>
        <BrowserRouter>
          <CursorSpotlight />
          <div className="relative z-10">
            <Routes>
              <Route path="/login" element={<LoginPage />} />
              <Route
                element={
                  <ProtectedRoute>
                    <AppShell />
                  </ProtectedRoute>
                }
              >
                <Route index element={<DashboardPage />} />
                <Route path="patients" element={<PatientsPage />} />
                <Route path="patients/:patientId" element={<PatientDetailsPage />} />
                <Route path="screening" element={<ScreeningPage />} />
                <Route
                  path="screenings/:screeningId"
                  element={<ScreeningResultPage />}
                />
                <Route path="settings" element={<SettingsPage />} />
                <Route path="*" element={<NotFoundPage />} />
              </Route>
            </Routes>
          </div>
        </BrowserRouter>
      </AuthProvider>
    </LanguageProvider>
  );
};

export default App;
