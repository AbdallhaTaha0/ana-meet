import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, errorMessage, isRequestAbort } from '../../shared/api';
import { readFetchCache, writeFetchCache } from '../../shared/fetchCache';
import type { Page, UserCard } from '../../shared/types';
import { conversationsApi } from '../conversations/service';
import { useConfirm } from '../../shared/ConfirmDialog';
import { useRealtimeSocket } from '../realtime/RealtimeProvider';
import { friendsApi, type FriendRequest } from '../friends/service';

export function usePeople() {
  const navigate = useNavigate();
  const socket = useRealtimeSocket();
  const confirm = useConfirm();
  const [contacts, setContacts] = useState<UserCard[]>([]);
  const [results, setResults] = useState<UserCard[]>([]);
  const [bots, setBots] = useState<UserCard[]>([]);
  const [blocked, setBlocked] = useState<UserCard[]>([]);
  const [requests, setRequests] = useState<FriendRequest[]>([]);
  const [query, setQuery] = useState('');
  const [error, setError] = useState('');
  const loadContacts = useCallback(
    (signal?: AbortSignal) =>
      api
        .get<Page<UserCard>>('/api/v1/contacts', { params: { limit: 100 }, signal })
        .then(({ data }) => setContacts(data.items)),
    [],
  );
  const loadBlocked = useCallback(
    (signal?: AbortSignal) =>
      api
        .get<Page<UserCard>>('/api/v1/blocks', { params: { limit: 100 }, signal })
        .then(({ data }) => setBlocked(data.items)),
    [],
  );
  const loadRequests = useCallback(
    (signal?: AbortSignal) =>
      friendsApi.list('all', undefined, signal).then((page) => setRequests(page.items)),
    [],
  );
  useEffect(() => {
    // One cached bundle for the whole tab; socket hints refresh pieces live.
    const cached = readFetchCache<{
      contacts: UserCard[];
      blocked: UserCard[];
      requests: FriendRequest[];
      bots: UserCard[];
    }>('people:bundle');
    if (cached) {
      setContacts(cached.contacts);
      setBlocked(cached.blocked);
      setRequests(cached.requests);
      setBots(cached.bots);
      return;
    }
    const controller = new AbortController();
    const signal = controller.signal;
    void (async () => {
      try {
        const [contactsPage, blockedPage, requestsPage, botsPage] = await Promise.all([
          api.get<Page<UserCard>>('/api/v1/contacts', { params: { limit: 100 }, signal }),
          api.get<Page<UserCard>>('/api/v1/blocks', { params: { limit: 100 }, signal }),
          friendsApi.list('all', undefined, signal),
          api.get<Page<UserCard>>('/api/v1/bots', { params: { limit: 50 }, signal }),
        ]);
        setContacts(contactsPage.data.items);
        setBlocked(blockedPage.data.items);
        setRequests(requestsPage.items);
        setBots(botsPage.data.items);
        writeFetchCache('people:bundle', {
          contacts: contactsPage.data.items,
          blocked: blockedPage.data.items,
          requests: requestsPage.items,
          bots: botsPage.data.items,
        });
      } catch (cause) {
        if (!isRequestAbort(cause)) setError(errorMessage(cause));
      }
    })();
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Live: friend requests, contacts, and blocks refresh on socket hints + reconnect.
  useEffect(() => {
    const refreshAll = () => {
      void Promise.all([loadContacts(), loadBlocked(), loadRequests()]).catch(() => undefined);
    };
    const onFriend = () => refreshAll();
    const onContact = () => {
      void loadContacts().catch(() => undefined);
    };
    const onBlock = () => {
      void Promise.all([loadContacts(), loadBlocked(), loadRequests()]).catch(() => undefined);
    };
    socket.on('connect', refreshAll);
    socket.on('friend-request:new', onFriend);
    socket.on('friend-request:updated', onFriend);
    socket.on('friend-request:removed', onFriend);
    socket.on('contact:updated', onContact);
    socket.on('block:updated', onBlock);
    return () => {
      socket.off('connect', refreshAll);
      socket.off('friend-request:new', onFriend);
      socket.off('friend-request:updated', onFriend);
      socket.off('friend-request:removed', onFriend);
      socket.off('contact:updated', onContact);
      socket.off('block:updated', onBlock);
    };
  }, [loadBlocked, loadContacts, loadRequests, socket]);

  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      return;
    }
    const timer = window.setTimeout(() => {
      void conversationsApi
        .search(query.trim())
        .then(setResults)
        .catch((cause) => setError(errorMessage(cause)));
    }, 250);
    return () => window.clearTimeout(timer);
  }, [query]);

  const requestFor = (personId: string): FriendRequest | undefined =>
    requests.find(
      (r) =>
        (r.requester.id === personId || r.addressee.id === personId) &&
        ['PENDING', 'ACCEPTED'].includes(r.status),
    );

  async function chat(person: UserCard) {
    try {
      const conversation = await conversationsApi.direct(person.id);
      navigate(`/app/chats/${conversation.id}`);
    } catch (cause) {
      setError(errorMessage(cause));
    }
  }
  async function toggleContact(person: UserCard) {
    try {
      if (contacts.some((item) => item.id === person.id))
        await api.delete(`/api/v1/contacts/${person.id}`);
      else await api.post('/api/v1/contacts', { contactUserId: person.id });
      await loadContacts();
    } catch (cause) {
      setError(errorMessage(cause));
    }
  }
  async function sendRequest(person: UserCard) {
    try {
      await friendsApi.send(person.id);
      await loadRequests();
    } catch (cause) {
      setError(errorMessage(cause));
    }
  }
  async function acceptRequest(id: string) {
    try {
      await friendsApi.accept(id);
      await Promise.all([loadRequests(), loadContacts()]);
    } catch (cause) {
      setError(errorMessage(cause));
    }
  }
  async function rejectRequest(id: string) {
    try {
      await friendsApi.reject(id);
      await loadRequests();
    } catch (cause) {
      setError(errorMessage(cause));
    }
  }
  async function cancelRequest(id: string) {
    try {
      await friendsApi.cancel(id);
      await loadRequests();
    } catch (cause) {
      setError(errorMessage(cause));
    }
  }
  async function removeRequest(id: string) {
    try {
      await friendsApi.remove(id);
      await Promise.all([loadRequests(), loadContacts()]);
    } catch (cause) {
      setError(errorMessage(cause));
    }
  }
  async function block(person: UserCard) {
    const ok = await confirm({
      title: `Block ${person.displayName}?`,
      description:
        'You will no longer be able to contact each other. Pending friend requests will be withdrawn.',
      confirmLabel: 'Block',
      danger: true,
    });
    if (!ok) return;
    try {
      await api.post('/api/v1/blocks', { blockedUserId: person.id });
      await Promise.all([loadContacts(), loadBlocked(), loadRequests()]);
      setResults((old) => old.filter((item) => item.id !== person.id));
    } catch (cause) {
      setError(errorMessage(cause));
    }
  }
  async function unblock(person: UserCard) {
    try {
      await api.delete(`/api/v1/blocks/${person.id}`);
      await loadBlocked();
    } catch (cause) {
      setError(errorMessage(cause));
    }
  }
  return {
    contacts,
    results,
    bots,
    blocked,
    requests,
    requestFor,
    query,
    setQuery,
    error,
    chat,
    toggleContact,
    sendRequest,
    acceptRequest,
    rejectRequest,
    cancelRequest,
    removeRequest,
    block,
    unblock,
  };
}
