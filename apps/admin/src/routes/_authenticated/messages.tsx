import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useAdminQuery, useAdminMutation } from "@/hooks/useAdminQuery";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { QueryState } from "@/components/ui/QueryState";
import { SearchInput } from "@/components/ui/SearchInput";
import { toast } from "@/components/ui/Toast";
import { formatDateTime } from "@/lib/utils";
import { useConfirmStore } from "@/stores/confirm-store";
import { useFilteredList } from "@/hooks/useFilteredList";
import { Eye, EyeOff, Trash2 } from "lucide-react";

export const Route = createFileRoute("/_authenticated/messages")({
  component: MessagesPage,
});

interface MessageRow extends Record<string, unknown> {
  _id: Id<"contactMessages">;
  _creationTime: number;
  name: string;
  email: string;
  subject: string;
  message: string;
  isRead: boolean;
}

function MessagesPage() {
  const messages = useAdminQuery(
    api.features.admin.inbox.listContactMessages,
    {}
  );
  const toggleRead = useAdminMutation(
    api.features.admin.inbox.markContactMessageRead
  );
  const deleteMessage = useAdminMutation(
    api.features.admin.inbox.deleteContactMessage
  );
  const { confirm } = useConfirmStore();

  const [search, setSearch] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const filteredMessages = useFilteredList(
    messages as MessageRow[] | undefined,
    search,
    (m) => [m.name, m.email, m.subject]
  );

  const handleToggleRead = async (msg: MessageRow) => {
    try {
      await toggleRead({ id: msg._id, isRead: !msg.isRead });
    } catch {
      toast("error", "Failed to update message status");
    }
  };

  const handleDelete = async (msg: MessageRow) => {
    const ok = await confirm({
      title: "Delete Message",
      message: "This message will be permanently deleted.",
      confirmLabel: "Delete",
      variant: "danger",
    });
    if (!ok) return;
    try {
      await deleteMessage({ id: msg._id });
    } catch {
      toast("error", "Failed to delete message");
    }
  };

  const columns: Column<MessageRow>[] = [
    { key: "name", header: "Name" },
    {
      key: "email",
      header: "Email",
      render: (m) => <span className="text-ink-muted">{m.email}</span>,
    },
    { key: "subject", header: "Subject" },
    {
      key: "_creationTime",
      header: "Date",
      sortable: true,
      render: (m) => (
        <span className="text-ink-muted">{formatDateTime(m._creationTime)}</span>
      ),
    },
    {
      key: "isRead",
      header: "Status",
      render: (m) => (
        <Badge variant={m.isRead ? "default" : "info"}>
          {m.isRead ? "Read" : "Unread"}
        </Badge>
      ),
    },
    {
      key: "actions",
      header: "Actions",
      render: (m) => (
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            aria-label={m.isRead ? "Mark unread" : "Mark read"}
            title={m.isRead ? "Mark unread" : "Mark read"}
            onClick={(e) => {
              e.stopPropagation();
              handleToggleRead(m);
            }}
          >
            {m.isRead ? (
              <EyeOff className="h-3.5 w-3.5" />
            ) : (
              <Eye className="h-3.5 w-3.5" />
            )}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            aria-label="Delete message"
            title="Delete message"
            onClick={(e) => {
              e.stopPropagation();
              handleDelete(m);
            }}
          >
            <Trash2 className="h-3.5 w-3.5 text-danger" />
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div>
      <h1 className="mb-6 text-2xl font-semibold text-ink">
        Contact Messages
      </h1>

      <div className="mb-4 flex items-center gap-3">
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder="Search messages..."
          className="w-72"
        />
        {messages && (
          <span className="text-xs text-ink-subtle">
            {search.trim()
              ? `${filteredMessages?.length ?? 0} of ${messages.length} messages`
              : `${messages.length} messages`}
          </span>
        )}
      </div>

      <QueryState
        data={filteredMessages}
        empty={{ command: "list messages", message: "No messages yet" }}
      >
        {(rows) => (
          <DataTable
            columns={columns}
            data={rows}
            rowKey={(m) => m._id}
            expandedId={expandedId}
            onExpandedChange={setExpandedId}
            renderExpanded={(m) => (
              <div>
                <p className="mb-1 font-mono text-[0.68rem] uppercase tracking-wider text-ink-subtle">
                  Message
                </p>
                <p className="whitespace-pre-wrap text-sm text-ink-muted">
                  {m.message}
                </p>
              </div>
            )}
          />
        )}
      </QueryState>
    </div>
  );
}
