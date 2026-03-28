import { Navigate, Route, Routes, useLocation } from "react-router-dom";

import { AppShell } from "../../components/layout/AppShell.jsx";
import { useAuth } from "../store/AuthStore.jsx";
import { DialogChatPage } from "../../pages/DialogChatPage.jsx";
import { ForgotPasswordPage } from "../../pages/ForgotPasswordPage.jsx";
import { FriendsPage } from "../../pages/FriendsPage.jsx";
import { LeaderboardPage } from "../../pages/LeaderboardPage.jsx";
import { LoginPage } from "../../pages/LoginPage.jsx";
import { ProfilePage } from "../../pages/ProfilePage.jsx";
import { RegisterPage } from "../../pages/RegisterPage.jsx";
import { ResetPasswordPage } from "../../pages/ResetPasswordPage.jsx";
import { RoomChatPage } from "../../pages/RoomChatPage.jsx";
import { RoomsCatalogPage } from "../../pages/RoomsCatalogPage.jsx";
import { SessionsPage } from "../../pages/SessionsPage.jsx";
import { SettingsPage } from "../../pages/SettingsPage.jsx";
import { UserProfilePage } from "../../pages/UserProfilePage.jsx";

function ProtectedRoute({ children }) {
  const auth = useAuth();
  const location = useLocation();

  if (auth.isLoading) {
    return <div className="screen-center">Loading workspace...</div>;
  }

  if (!auth.isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  return children;
}

function GuestRoute({ children }) {
  const auth = useAuth();

  if (auth.isLoading) {
    return <div className="screen-center">Loading workspace...</div>;
  }

  if (auth.isAuthenticated) {
    return <Navigate to="/rooms" replace />;
  }

  return children;
}

export function AppRouter() {
  return (
    <Routes>
      <Route
        path="/login"
        element={
          <GuestRoute>
            <LoginPage />
          </GuestRoute>
        }
      />
      <Route
        path="/register"
        element={
          <GuestRoute>
            <RegisterPage />
          </GuestRoute>
        }
      />
      <Route
        path="/forgot-password"
        element={
          <GuestRoute>
            <ForgotPasswordPage />
          </GuestRoute>
        }
      />
      <Route
        path="/reset-password"
        element={
          <GuestRoute>
            <ResetPasswordPage />
          </GuestRoute>
        }
      />

      <Route
        path="/"
        element={
          <ProtectedRoute>
            <AppShell />
          </ProtectedRoute>
        }
      >
        <Route index element={<Navigate to="/rooms" replace />} />
        <Route path="rooms" element={<RoomsCatalogPage />} />
        <Route path="rooms/:roomId/chat" element={<RoomChatPage />} />
        <Route path="dialogs/:dialogId" element={<DialogChatPage />} />
        <Route path="profile" element={<ProfilePage />} />
        <Route path="users/:userId" element={<UserProfilePage />} />
        <Route path="leaderboard" element={<LeaderboardPage />} />
        <Route path="friends" element={<FriendsPage />} />
        <Route path="sessions" element={<SessionsPage />} />
        <Route path="settings" element={<SettingsPage />} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
