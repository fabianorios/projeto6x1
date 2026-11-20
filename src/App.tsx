import { useState } from 'react'
import { LoginScreen } from './components/LoginScreen'
import { WizardShell } from './components/WizardShell'
import {
  CLOSED_CLIENT_SESSION,
  openSessionFromLogin,
  openSessionWithoutLogin,
  type ClientSession,
} from './sessionGate'

export default function App() {
  const [session, setSession] = useState<ClientSession>(CLOSED_CLIENT_SESSION)

  if (!session.open) {
    return (
      <LoginScreen
        onEnterDemo={() => setSession(openSessionWithoutLogin())}
        onLoginSuccess={(email) => {
          const next = openSessionFromLogin(email ?? '')
          if (next.open) setSession(next)
        }}
      />
    )
  }

  // Soft gate cleared — existing wizard/studio shell (Sessão Aberta · LGPD).
  return <WizardShell />
}
