import { AuthProvider } from "../store/AuthStore.jsx";
import { UiPreferencesProvider } from "../store/UiPreferencesStore.jsx";
import { SocketProvider } from "../../socket/SocketProvider.jsx";

export function AppProviders({ children }) {
  return (
    <AuthProvider>
      <UiPreferencesProvider>
        <SocketProvider>{children}</SocketProvider>
      </UiPreferencesProvider>
    </AuthProvider>
  );
}
