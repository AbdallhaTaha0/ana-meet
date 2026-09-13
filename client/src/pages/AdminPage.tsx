import { AdminForms } from '../features/admin/AdminForms';
import { AdminUsers } from '../features/admin/AdminUsers';
import { useAdmin } from '../features/admin/useAdmin';
import { ContentPage, ErrorNotice, PageHeader } from '../shared/ui';

export function AdminPage() {
  const admin = useAdmin();
  const metrics =
    admin.stats &&
    ([
      ['Active people', admin.stats.users.active],
      ['Conversations', admin.stats.conversations.total],
      ['Messages', admin.stats.messages.total],
      ['Active stories', admin.stats.stories.active],
      ['Unread updates', admin.stats.notifications.unread],
    ] as const);
  return (
    <ContentPage>
      <PageHeader
        eyebrow="Administration"
        title="Overview"
        description="Manage the people and activity on ANA Meet."
      />
      {admin.error && <ErrorNotice message={admin.error} />}
      {admin.notice && (
        <p role="status" className="text-sm text-sea">
          {admin.notice}
        </p>
      )}
      {!metrics ? (
        <p role="status">Loading overview…</p>
      ) : (
        <dl className="grid max-w-5xl grid-cols-2 gap-6 lg:grid-cols-5">
          {metrics.map(([label, value]) => (
            <div key={label} className="border-t-2 border-sea pt-3">
              <dt className="text-xs text-muted">{label}</dt>
              <dd className="mt-2 text-3xl font-bold tracking-tight">{value}</dd>
            </div>
          ))}
        </dl>
      )}
      <AdminUsers
        users={admin.users}
        search={admin.search}
        onSearch={admin.setSearch}
        onAct={(person, action) => {
          void admin.act(person, action);
        }}
      />
      <AdminForms
        password={admin.password}
        onBot={admin.createBot}
        onAnnouncement={admin.announce}
      />
      <section className="mt-12 max-w-5xl">
        <h2 className="mb-4 text-xl font-bold">Recent audit activity</h2>
        {admin.audit.map((entry) => (
          <div className="flex flex-wrap gap-2 border-b border-line py-3 text-sm" key={entry.id}>
            <strong>{entry.action}</strong>
            <span className="flex-1 text-muted">
              {entry.admin?.displayName || 'Former admin'} · {entry.targetType}
            </span>
            <time className="text-xs text-muted">
              {new Intl.DateTimeFormat(undefined, {
                dateStyle: 'medium',
                timeStyle: 'short',
              }).format(new Date(entry.createdAt))}
            </time>
          </div>
        ))}
      </section>
    </ContentPage>
  );
}
