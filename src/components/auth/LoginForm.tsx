import { useState } from 'react';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Button } from '../ui/button';
import { Alert } from '../ui/alert';
import type { AuthResponse, LoginData } from '../../lib/api';
import { login, ApiError } from '../../lib/api';

interface Props {
  onSuccess: (auth: AuthResponse) => void;
}

export function LoginForm({ onSuccess }: Props) {
  const [form, setForm] = useState<LoginData>({ email: '', password: '' });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await login(form);
      onSuccess(res);
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else if (err && typeof err === 'object' && 'message' in err) {
        setError(String((err as { message: string }).message));
      } else {
        setError('Login fehlgeschlagen');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && (
        <Alert variant="destructive">
          <div className="text-sm">{error}</div>
        </Alert>
      )}
      <div className="space-y-2">
        <Label htmlFor="email">E-Mail</Label>
        <Input
          id="email"
          type="email"
          value={form.email}
          onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
          required
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="password">Passwort</Label>
        <Input
          id="password"
          type="password"
          value={form.password}
          onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
          required
        />
      </div>
      <Button type="submit" className="w-full rounded-sm" disabled={loading}>
        {loading ? 'Anmelden…' : 'Anmelden'}
      </Button>
    </form>
  );
}
