import type { AdminUser } from './types';
import { Button, Field } from '../../shared/ui';

export function AdminUsers({
  users,
  search,
  onSearch,
  onAct,
}: {
  users: AdminUser[];
  search: string;
  onSearch: (value: string) => void;
  onAct: (person: AdminUser, action: 'disable' | 'restore' | 'delete') => void;
}) {
  return (
    <section className="mt-12 max-w-5xl">
      <h2 className="mb-5 text-xl font-bold">People</h2>
      <div className="max-w-xl">
        <Field
          id="admin-search"
          label="Search accounts"
          value={search}
          onChange={(event) => onSearch(event.target.value)}
          placeholder="Name, username or email"
        />
      </div>
      <div className="mt-5">
        {users.map((person) => (
          <div
            className="flex flex-wrap items-center gap-3 border-b border-line py-4"
            key={person.id}
          >
            <div className="min-w-0 flex-1">
              <strong className="block text-sm">
                {person.displayName} · {person.role}
              </strong>
              <small className="text-xs text-muted">
                @{person.username} · {person.email} · {person.status}
              </small>
            </div>
            <Button
              onClick={() => onAct(person, person.status === 'ACTIVE' ? 'disable' : 'restore')}
            >
              {person.status === 'ACTIVE' ? 'Disable' : 'Restore'}
            </Button>
            <Button className="text-danger" onClick={() => onAct(person, 'delete')}>
              Delete
            </Button>
          </div>
        ))}
      </div>
    </section>
  );
}
