import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, errorMessage } from '../shared/api';
import type { CurrentUser } from '../shared/types';
import { Button, ContentPage, ErrorNotice, Field, PageHeader } from '../shared/ui';
import { useAuth } from '../features/auth/AuthProvider';

export function ProfilePage() {
  const { user, setUser, logout } = useAuth();
  const navigate = useNavigate();
  const [name, setName] = useState(user?.displayName || '');
  const [username, setUsername] = useState(user?.username || '');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  async function save(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const { data } = await api.patch<{ user: CurrentUser }>('/api/v1/users/me', {
        displayName: name.trim(),
        username: username.trim().toLowerCase(),
      });
      setUser(data.user);
      setNotice('Changes saved.');
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  }
  return (
    <ContentPage>
      <div className="max-w-xl">
        <PageHeader
          eyebrow="Your account"
          title="Profile"
          description="How you appear to the people you talk to."
        />
        <form
          className="grid gap-5"
          onSubmit={(event) => {
            void save(event);
          }}
        >
          <Field
            id="profile-name"
            label="Display name"
            value={name}
            maxLength={80}
            onChange={(event) => setName(event.target.value)}
            required
          />
          <Field
            id="profile-username"
            label="Username"
            value={username}
            maxLength={30}
            onChange={(event) => setUsername(event.target.value)}
            required
          />
          <Field id="profile-email" label="Email" value={user?.email || ''} readOnly />
          <small className="text-muted">Your public ID: #{user?.publicId}</small>
          {error && <ErrorNotice message={error} />}
          {notice && (
            <p role="status" className="text-sm text-sea">
              {notice}
            </p>
          )}
          <Button
            primary
            className="justify-self-start"
            disabled={busy || !name.trim() || !username.trim()}
          >
            {busy ? 'Saving…' : 'Save changes'}
          </Button>
        </form>
        <div className="mt-9 border-t border-line pt-7">
          <Button
            onClick={() => {
              void logout().then(() => navigate('/login'));
            }}
          >
            Log out
          </Button>
        </div>
      </div>
    </ContentPage>
  );
}
