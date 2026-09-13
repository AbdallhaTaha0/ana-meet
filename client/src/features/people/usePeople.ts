import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, errorMessage } from '../../shared/api';
import type { Page, UserCard } from '../../shared/types';
import { conversationsApi } from '../conversations/service';

export function usePeople() {
  const navigate = useNavigate();
  const [contacts, setContacts] = useState<UserCard[]>([]);
  const [results, setResults] = useState<UserCard[]>([]);
  const [bots, setBots] = useState<UserCard[]>([]);
  const [blocked, setBlocked] = useState<UserCard[]>([]);
  const [query, setQuery] = useState('');
  const [error, setError] = useState('');
  const loadContacts = () =>
    api
      .get<Page<UserCard>>('/api/v1/contacts', { params: { limit: 100 } })
      .then(({ data }) => setContacts(data.items));
  const loadBlocked = () =>
    api
      .get<Page<UserCard>>('/api/v1/blocks', { params: { limit: 100 } })
      .then(({ data }) => setBlocked(data.items));
  useEffect(() => {
    void Promise.all([
      loadContacts(),
      loadBlocked(),
      api
        .get<Page<UserCard>>('/api/v1/bots', { params: { limit: 50 } })
        .then(({ data }) => setBots(data.items)),
    ]).catch((cause) => setError(errorMessage(cause)));
  }, []);
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
  async function block(person: UserCard) {
    if (
      !window.confirm(
        `Block ${person.displayName}? You will no longer be able to contact each other.`,
      )
    )
      return;
    try {
      await api.post('/api/v1/blocks', { blockedUserId: person.id });
      await Promise.all([loadContacts(), loadBlocked()]);
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
    query,
    setQuery,
    error,
    chat,
    toggleContact,
    block,
    unblock,
  };
}
