import { useState } from 'react';
import { Card } from '../ui/card';
import { LoginForm } from './LoginForm';
import { RegisterInline } from './RegisterInline';
import type { AuthResponse } from '../../lib/api';

interface Props {
  onAuthenticated: (auth: AuthResponse) => void;
}

export function AuthScreen({ onAuthenticated }: Props) {
  const [showRegister, setShowRegister] = useState(false);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4 py-10">
      <Card className="w-full max-w-md p-6 space-y-6 shadow-lg">
        <div className="space-y-1 text-center">
          <h1 className="text-2xl font-semibold text-gray-900">Intelligent Study Planner</h1>
          <p className="text-sm text-gray-600">Melde dich an oder erstelle ein Konto</p>
        </div>
        {showRegister ? (
          <RegisterInline
            onSuccess={onAuthenticated}
          />
        ) : (
          <>
            <LoginForm onSuccess={onAuthenticated} />
            <div className="mt-4 text-center text-sm text-gray-600">
              Noch kein Konto?{' '}
              <button
                type="button"
                onClick={() => setShowRegister(true)}
                className="text-blue-600 hover:text-blue-700 font-medium underline underline-offset-2"
              >
                Jetzt registrieren
              </button>
            </div>
          </>
        )}
        <p className="text-center text-xs text-gray-500 mt-4">Deine Daten werden sicher serverseitig gespeichert.</p>
      </Card>
    </div>
  );
}
