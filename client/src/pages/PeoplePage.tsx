import { Search } from 'lucide-react';
import { useAuth } from '../features/auth/AuthProvider';
import { PersonRow } from '../features/people/PersonRow';
import { usePeople } from '../features/people/usePeople';
import { Button, ContentPage, EmptyState, ErrorNotice, PageHeader } from '../shared/ui';

export function PeoplePage() {
  const people = usePeople();
  const { user } = useAuth();
  const list = people.query.trim() ? people.results : people.contacts;
  const inbound = people.requests.filter(
    (r) => r.status === 'PENDING' && r.addressee.id === user?.id,
  );
  const outbound = people.requests.filter(
    (r) => r.status === 'PENDING' && r.requester.id === user?.id,
  );
  const friends = people.requests.filter((r) => r.status === 'ACCEPTED');
  return (
    <ContentPage>
      <PageHeader
        eyebrow="Find your people"
        title="People"
        description="Search for someone, say hello, and send a friend request. Messaging works right away; friendship needs an accept."
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
      {!people.query && inbound.length > 0 && (
        <section className="mb-10 max-w-3xl">
          <h2 className="mb-3 text-lg font-bold">Friend requests for you</h2>
          {inbound.map((req) => (
            <PersonRow
              key={req.id}
              person={req.requester}
              isContact={people.contacts.some((item) => item.id === req.requester.id)}
              friendStatus="PENDING"
              onChat={() => {
                void people.chat(req.requester);
              }}
              onContact={() => {
                void people.toggleContact(req.requester);
              }}
              onBlock={() => {
                void people.block(req.requester);
              }}
              onAcceptRequest={() => {
                void people.acceptRequest(req.id);
              }}
              onRejectRequest={() => {
                void people.rejectRequest(req.id);
              }}
            />
          ))}
        </section>
      )}
      {!people.query && outbound.length > 0 && (
        <section className="mb-10 max-w-3xl">
          <h2 className="mb-3 text-lg font-bold">Requests you sent</h2>
          {outbound.map((req) => (
            <div key={req.id} className="flex items-center justify-between gap-3">
              <div className="flex-1">
                <PersonRow
                  key={req.id}
                  person={req.addressee}
                  isContact={people.contacts.some((item) => item.id === req.addressee.id)}
                  friendStatus="PENDING"
                  isOutgoing
                  onChat={() => {
                    void people.chat(req.addressee);
                  }}
                  onRejectRequest={() => {
                    void people.cancelRequest(req.id);
                  }}
                />
              </div>
            </div>
          ))}
        </section>
      )}
      {!people.query && friends.length > 0 && (
        <section className="mb-10 max-w-3xl">
          <h2 className="mb-3 text-lg font-bold">Friends</h2>
          {friends.map((req) => {
            const other = req.requester.id === user?.id ? req.addressee : req.requester;
            return (
              <PersonRow
                key={req.id}
                person={other}
                isContact={people.contacts.some((item) => item.id === other.id)}
                friendStatus="ACCEPTED"
                onChat={() => {
                  void people.chat(other);
                }}
                onContact={() => {
                  void people.toggleContact(other);
                }}
                onBlock={() => {
                  void people.block(other);
                }}
                onUnfriend={() => {
                  void people.removeRequest(req.id);
                }}
              />
            );
          })}
        </section>
      )}
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
          list.map((person) => {
            const rel = people.requestFor(person.id);
            const isOutgoing = rel ? rel.requester.id === user?.id : false;
            return (
              <PersonRow
                key={person.id}
                person={person}
                isContact={people.contacts.some((item) => item.id === person.id)}
                friendStatus={rel?.status === 'PENDING' || rel?.status === 'ACCEPTED' ? rel.status : undefined}
                isOutgoing={isOutgoing}
                onChat={() => {
                  void people.chat(person);
                }}
                onContact={() => {
                  void people.toggleContact(person);
                }}
                onBlock={() => {
                  void people.block(person);
                }}
                onSendRequest={
                  !rel
                    ? () => {
                        void people.sendRequest(person);
                      }
                    : undefined
                }
                onAcceptRequest={
                  rel?.status === 'PENDING' && !isOutgoing
                    ? () => {
                        void people.acceptRequest(rel.id);
                      }
                    : undefined
                }
                onUnfriend={
                  rel?.status === 'ACCEPTED'
                    ? () => {
                        void people.removeRequest(rel.id);
                      }
                    : undefined
                }
                onRejectRequest={
                  rel?.status === 'PENDING'
                    ? () => {
                        void (isOutgoing ? people.cancelRequest(rel.id) : people.rejectRequest(rel.id));
                      }
                    : undefined
                }
              />
            );
          })
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
