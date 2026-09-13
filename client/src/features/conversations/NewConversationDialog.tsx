import { X } from 'lucide-react';
import type { UserCard } from '../../shared/types';
import { Modal } from '../../shared/Modal';
import { Avatar, Button, ErrorNotice, Field, IconButton } from '../../shared/ui';

interface Props {
  search: string;
  people: UserCard[];
  selected: string[];
  groupTitle: string;
  error: string;
  onSearch: (value: string) => void;
  onSelect: (id: string) => void;
  onGroupTitle: (value: string) => void;
  onDirect: (person: UserCard) => void;
  onGroup: () => void;
  onClose: () => void;
}

export function NewConversationDialog(props: Props) {
  return (
    <Modal labelledBy="new-chat-title" onClose={props.onClose}>
      <div className="mb-5 flex items-start justify-between">
        <div>
          <p className="text-xs font-bold tracking-widest text-sea uppercase">Connect</p>
          <h2 id="new-chat-title" className="mt-1 text-2xl font-bold">
            New conversation
          </h2>
        </div>
        <IconButton label="Close" onClick={props.onClose}>
          <X size={20} />
        </IconButton>
      </div>
      <Field
        id="find-person"
        label="Find a person"
        autoFocus
        value={props.search}
        onChange={(event) => props.onSearch(event.target.value)}
        placeholder="Name, username or public ID"
      />
      <div className="my-4 max-h-64 space-y-2 overflow-y-auto">
        {props.people.map((person) => (
          <div
            key={person.id}
            className="flex items-center gap-3 rounded-xl border border-line p-3"
          >
            <Avatar name={person.displayName} small />
            <span className="min-w-0 flex-1">
              <strong className="block truncate text-sm">{person.displayName}</strong>
              <small className="text-xs text-muted">@{person.username}</small>
            </span>
            <Button onClick={() => props.onDirect(person)}>Chat</Button>
            <label className="flex items-center gap-1 text-xs text-muted">
              <input
                type="checkbox"
                checked={props.selected.includes(person.id)}
                onChange={() => props.onSelect(person.id)}
              />{' '}
              Group
            </label>
          </div>
        ))}
      </div>
      {props.selected.length > 0 && (
        <div className="grid gap-3 border-t border-line pt-4">
          <Field
            id="group-title"
            label={`Group name (${props.selected.length} selected)`}
            maxLength={100}
            value={props.groupTitle}
            onChange={(event) => props.onGroupTitle(event.target.value)}
          />
          <Button primary disabled={!props.groupTitle.trim()} onClick={props.onGroup}>
            Create group
          </Button>
        </div>
      )}
      {props.error && <ErrorNotice message={props.error} />}
    </Modal>
  );
}
