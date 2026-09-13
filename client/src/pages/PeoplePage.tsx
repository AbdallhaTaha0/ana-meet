import { Search } from 'lucide-react';
import { PersonRow } from '../features/people/PersonRow';
import { usePeople } from '../features/people/usePeople';
import { Button, ContentPage, EmptyState, ErrorNotice, PageHeader } from '../shared/ui';

export function PeoplePage() {
  const people = usePeople();
  const list = people.query.trim() ? people.results : people.contacts;
  return (
    <ContentPage>
      <PageHeader
        eyebrow="Find your people"
        title="People"
        description="Search for someone, keep them close, or start talking."
      />
      <label className="mb-6 flex max-w-2xl items-center gap-2 rounded-lg bg-paper px-3 focus-within:ring-2 focus-within:ring-sea">
        <Search size={19} className="text-muted" />
        <span className="sr-only">Search people</span>
        <input
          className="w-full border-0 bg-transparent py-3 text-sm outline-none"
          value={people.query}
          onChange={(event) => people.setQuery(event.target.value)}
          placeholder="Search name, username or public ID"
        />
      </label>
      {people.error && <ErrorNotice message={people.error} />}
      <section className="max-w-3xl">
        <h2 className="mb-3 text-lg font-bold">
          {people.query ? 'Search results' : 'Your contacts'}
        </h2>
        {list.length === 0 ? (
          <EmptyState
            title={people.query ? 'No people found' : 'No contacts yet'}
            description={
              people.query
                ? 'Try another name or username.'
                : 'Search above to find someone you know.'
            }
          />
        ) : (
          list.map((person) => (
            <PersonRow
              key={person.id}
              person={person}
              isContact={people.contacts.some((item) => item.id === person.id)}
              onChat={() => {
                void people.chat(person);
              }}
              onContact={() => {
                void people.toggleContact(person);
              }}
              onBlock={() => {
                void people.block(person);
              }}
            />
          ))
        )}
      </section>
      {!people.query && (
        <>
          <section className="mt-10 max-w-3xl">
            <h2 className="mb-3 text-lg font-bold">Bots</h2>
            {people.bots.length === 0 ? (
              <p className="text-sm text-muted">No bots available yet.</p>
            ) : (
              people.bots.map((bot) => (
                <PersonRow
                  key={bot.id}
                  person={bot}
                  isContact={false}
                  onChat={() => {
                    void people.chat(bot);
                  }}
                />
              ))
            )}
          </section>
          <section className="mt-10 max-w-3xl">
            <h2 className="mb-3 text-lg font-bold">Blocked people</h2>
            {people.blocked.length === 0 ? (
              <p className="text-sm text-muted">You haven't blocked anyone.</p>
            ) : (
              people.blocked.map((person) => (
                <div
                  key={person.id}
                  className="flex items-center justify-between border-b border-line py-4"
                >
                  <span className="text-sm">
                    {person.displayName} · @{person.username}
                  </span>
                  <Button
                    onClick={() => {
                      void people.unblock(person);
                    }}
                  >
                    Unblock
                  </Button>
                </div>
              ))
            )}
          </section>
        </>
      )}
    </ContentPage>
  );
}
