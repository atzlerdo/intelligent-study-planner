import { useState } from 'react';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Button } from '../ui/button';
import { Alert } from '../ui/alert';
import type { AuthResponse, RegisterData } from '../../lib/api';
import { register, ApiError } from '../../lib/api';

interface Props {
  onSuccess: (auth: AuthResponse) => void;
}

export function RegisterInline({ onSuccess }: Props) {
  const [form, setForm] = useState<RegisterData>({ name: '', email: '', password: '' });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const localIssues: Record<string, string> = {};
    if (!form.name.trim()) localIssues.name = 'Name darf nicht leer sein.';
    if (form.password.length < 8) localIssues.password = 'Mindestens 8 Zeichen.';
    if (!/^[^@]+@[^@]+\.[^@]+$/.test(form.email)) localIssues.email = 'Ungültige E-Mail Adresse.';
    setFieldErrors(localIssues);
    if (Object.keys(localIssues).length > 0) { setLoading(false); return; }

    try {
      const res = await register(form);
      onSuccess(res);
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        setError(err.message);
        const details = (err as ApiError).details as unknown;
        if (Array.isArray(details)) {
          const mapped: Record<string, string> = {};
          const isIssue = (x: unknown): x is { path: Array<string | number>; message: string } => {
            if (typeof x !== 'object' || x === null) return false;
            const rec = x as Record<string, unknown>;
            return Array.isArray(rec.path) && typeof rec.message === 'string';
          };
          for (const d of details) {
            if (!isIssue(d)) continue;
            const path = d.path;
            const message = d.message;
            if (path.length > 0) mapped[path.join('.')] = message;
          }
          setFieldErrors(mapped);
        }
      } else if (err && typeof err === 'object' && 'message' in err) {
        setError(String((err as { message: string }).message));
      } else {
        setError('Registrierung fehlgeschlagen');
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
      <div className="space-y-1">
        <Label htmlFor="reg-name">Name</Label>
        <Input
          id="reg-name"
          type="text"
          value={form.name}
          onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
          required
          aria-invalid={!!fieldErrors.name}
        />
        {fieldErrors.name && <p className="text-xs text-red-600">{fieldErrors.name}</p>}
      </div>
      <div className="space-y-1">
        <Label htmlFor="reg-email">E-Mail</Label>
        <Input
          id="reg-email"
          type="email"
          value={form.email}
          onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
          required
          aria-invalid={!!fieldErrors.email}
        />
        {fieldErrors.email && <p className="text-xs text-red-600">{fieldErrors.email}</p>}
      </div>
      <div className="space-y-1">
        <Label htmlFor="reg-password">Passwort</Label>
        <Input
          id="reg-password"
          type="password"
          value={form.password}
          onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
          required
          aria-invalid={!!fieldErrors.password}
        />
        <p className="text-xs text-gray-500">Mindestens 8 Zeichen.</p>
        {fieldErrors.password && <p className="text-xs text-red-600">{fieldErrors.password}</p>}
      </div>
      <Button type="submit" className="w-full rounded-sm" disabled={loading}>
        {loading ? 'Registrieren…' : 'Registrieren'}
      </Button>
    </form>
  );
}
