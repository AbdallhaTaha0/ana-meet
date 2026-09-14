import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from '../features/auth/AuthProvider';
import { LandingPage } from '../pages/LandingPage';
import { AuthPage } from '../pages/AuthPage';
import { AppLayout } from '../layouts/AppLayout';
import { RealtimeProvider } from '../features/realtime/RealtimeProvider';
import { ChatPage } from '../pages/ChatPage';
import { PeoplePage } from '../pages/PeoplePage';
import { StoriesPage } from '../pages/StoriesPage';
import { NotificationsPage } from '../pages/NotificationsPage';
import { ProfilePage } from '../pages/ProfilePage';
import { AdminPage } from '../pages/AdminPage';

function Protected() {
  const { user, loading } = useAuth();
  if (loading)
    return (
      <div className="grid min-h-dvh place-items-center bg-paper text-ink" role="status">
        Opening ANA Meet…
      </div>
    );
  return user ? (
    <RealtimeProvider>
      <AppLayout />
    </RealtimeProvider>
  ) : (
    <Navigate to="/login" replace />
  );
}

export function App() {
  const { user } = useAuth();
  return (
    <Routes>
      <Route path="/" element={user ? <Navigate to="/app/chats" replace /> : <LandingPage />} />
      <Route
        path="/login"
        element={user ? <Navigate to="/app/chats" replace /> : <AuthPage mode="login" />}
      />
      <Route
        path="/register"
        element={user ? <Navigate to="/app/chats" replace /> : <AuthPage mode="register" />}
      />
      <Route path="/app" element={<Protected />}>
        <Route index element={<Navigate to="chats" replace />} />
        <Route path="chats" element={<ChatPage />} />
        <Route path="chats/:conversationId" element={<ChatPage />} />
        <Route path="people" element={<PeoplePage />} />
        <Route path="stories" element={<StoriesPage />} />
        <Route path="notifications" element={<NotificationsPage />} />
        <Route path="profile" element={<ProfilePage />} />
        <Route
          path="admin"
          element={user?.role === 'ADMIN' ? <AdminPage /> : <Navigate to="/app/chats" replace />}
        />
      </Route>
      <Route
        path="*"
        element={
          <main className="grid min-h-dvh place-content-center gap-3 bg-paper px-5 text-center">
            <h1>Page not found</h1>
            <a href="/">Return to ANA Meet</a>
          </main>
        }
      />
    </Routes>
  );
}
