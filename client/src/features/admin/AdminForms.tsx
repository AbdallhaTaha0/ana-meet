import { useState, type FormEvent } from 'react';
import { Button, Field, TextField } from '../../shared/ui';

export function AdminForms({
  password,
  onBot,
  onAnnouncement,
}: {
  password: string;
  onBot: (data: { username: string; displayName: string; email: string }) => Promise<boolean>;
  onAnnouncement: (data: { title: string; body: string; userIds: string }) => Promise<boolean>;
}) {
  const [bot, setBot] = useState({ username: '', displayName: '', email: '' });
  const [announcement, setAnnouncement] = useState({ title: '', body: '', userIds: '' });
  async function createBot(event: FormEvent) {
    event.preventDefault();
    if (await onBot(bot)) setBot({ username: '', displayName: '', email: '' });
  }
  async function announce(event: FormEvent) {
    event.preventDefault();
    if (await onAnnouncement(announcement)) setAnnouncement({ title: '', body: '', userIds: '' });
  }
  return (
    <div className="mt-12 grid max-w-5xl gap-10 lg:grid-cols-2">
      <section>
        <h2 className="mb-5 text-xl font-bold">Create a bot</h2>
        <form
          className="grid gap-4"
          onSubmit={(event) => {
            void createBot(event);
          }}
        >
          <Field
            id="bot-name"
            label="Display name"
            value={bot.displayName}
            onChange={(event) => setBot({ ...bot, displayName: event.target.value })}
            required
          />
          <Field
            id="bot-username"
            label="Username"
            value={bot.username}
            onChange={(event) => setBot({ ...bot, username: event.target.value })}
            required
          />
          <Field
            id="bot-email"
            label="Email"
            type="email"
            value={bot.email}
            onChange={(event) => setBot({ ...bot, email: event.target.value })}
            required
          />
          <Button primary className="justify-self-start">
            Create bot
          </Button>
        </form>
        {password && (
          <div role="status" className="mt-5 grid gap-2 rounded-lg bg-red-50 p-4 text-sm">
            <strong>Save this password now. It is shown only once.</strong>
            <code className="break-all">{password}</code>
          </div>
        )}
      </section>
      <section>
        <h2 className="mb-5 text-xl font-bold">Send an announcement</h2>
        <form
          className="grid gap-4"
          onSubmit={(event) => {
            void announce(event);
          }}
        >
          <Field
            id="announcement-title"
            label="Title"
            maxLength={160}
            value={announcement.title}
            onChange={(event) => setAnnouncement({ ...announcement, title: event.target.value })}
            required
          />
          <TextField
            id="announcement-body"
            label="Message"
            maxLength={280}
            value={announcement.body}
            onChange={(event) => setAnnouncement({ ...announcement, body: event.target.value })}
            required
          />
          <TextField
            id="announcement-ids"
            label="Recipient user IDs, separated by commas"
            value={announcement.userIds}
            onChange={(event) => setAnnouncement({ ...announcement, userIds: event.target.value })}
            required
          />
          <Button primary className="justify-self-start">
            Send announcement
          </Button>
        </form>
      </section>
    </div>
  );
}
