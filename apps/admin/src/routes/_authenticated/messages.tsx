import { createFileRoute } from "@tanstack/react-router";
import { Fragment, useState, useMemo } from "react";
import { useAdminQuery, useAdminMutation } from "@/hooks/useAdminQuery";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Spinner } from "@/components/ui/Spinner";
import { EmptyState } from "@/components/ui/EmptyState";
import { formatDateTime } from "@/lib/utils";
import { useConfirmStore } from "@/stores/confirm-store";
import { SearchInput } from "@/components/ui/SearchInput";
import { Mail, Eye, EyeOff, Trash2 } from "lucide-react";

export const Route = createFileRoute("/_authenticated/messages")({
  component: MessagesPage,
});

function MessagesPage() {
  const messages = useAdminQuery(api.admin.listContactMessages, {});
  const toggleRead = useAdminMutation(api.admin.markContactMessageRead);
  const deleteMessage = useAdminMutation(api.admin.deleteContactMessage);
  const { confirm } = useConfirmStore();

  const [search, setSearch] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const filteredMessages = useMemo(() => {
    if (!messages) return undefined;
    if (!search.trim()) return messages;
    const term = search.toLowerCase();
    return messages.filter(
      (m) =>
        (m.name && m.name.toLowerCase().includes(term)) ||
        (m.email && m.email.toLowerCase().includes(term)) ||
        (m.subject && m.subject.toLowerCase().includes(term))
    );
  }, [messages, search]);

  if (!messages) return <Spinner />;
  if (messages.length === 0)
    return (
      <div>
        <h1 className="mb-6 text-2xl font-semibold text-zinc-100">
          Contact Messages
        </h1>
        <EmptyState
          icon={<Mail className="h-8 w-8" />}
          title="No messages yet"
        />
      </div>
    );

  return (
    <div>
      <h1 className="mb-6 text-2xl font-semibold text-zinc-100">
        Contact Messages
      </h1>

      <div className="mb-4 flex items-center gap-3">
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder="Search messages..."
          className="w-72"
        />
        <span className="text-xs text-zinc-500">
          {search.trim()
            ? `${filteredMessages?.length ?? 0} of ${messages.length} messages`
            : `${messages.length} messages`}
        </span>
      </div>

      <div className="overflow-x-auto rounded-lg border border-zinc-800">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-zinc-800 bg-zinc-900/50">
            <tr>
              <th className="px-4 py-3 font-medium text-zinc-400">Name</th>
              <th className="px-4 py-3 font-medium text-zinc-400">Email</th>
              <th className="px-4 py-3 font-medium text-zinc-400">Subject</th>
              <th className="px-4 py-3 font-medium text-zinc-400">Date</th>
              <th className="px-4 py-3 font-medium text-zinc-400">Status</th>
              <th className="px-4 py-3 font-medium text-zinc-400">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-800/50">
            {filteredMessages?.map((msg) => (
              <Fragment key={msg._id}>
                <tr
                  className="cursor-pointer transition-colors hover:bg-zinc-800/30"
                  onClick={() =>
                    setExpandedId(expandedId === msg._id ? null : msg._id)
                  }
                >
                  <td className="px-4 py-3 text-zinc-300">{msg.name}</td>
                  <td className="px-4 py-3 text-zinc-400">{msg.email}</td>
                  <td className="px-4 py-3 text-zinc-300">{msg.subject}</td>
                  <td className="px-4 py-3 text-zinc-400">
                    {formatDateTime(msg._creationTime)}
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant={msg.isRead ? "default" : "info"}>
                      {msg.isRead ? "Read" : "Unread"}
                    </Badge>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleRead({ id: msg._id, isRead: !msg.isRead });
                        }}
                        title={msg.isRead ? "Mark unread" : "Mark read"}
                      >
                        {msg.isRead ? (
                          <EyeOff className="h-3.5 w-3.5" />
                        ) : (
                          <Eye className="h-3.5 w-3.5" />
                        )}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={async (e) => {
                          e.stopPropagation();
                          const ok = await confirm({
                            title: "Delete Message",
                            message:
                              "This message will be permanently deleted.",
                            confirmLabel: "Delete",
                            variant: "danger",
                          });
                          if (ok) deleteMessage({ id: msg._id });
                        }}
                      >
                        <Trash2 className="h-3.5 w-3.5 text-red-400" />
                      </Button>
                    </div>
                  </td>
                </tr>
                {expandedId === msg._id && (
                  <tr key={`${msg._id}-body`}>
                    <td colSpan={6} className="bg-zinc-900/30 px-6 py-4">
                      <p className="mb-1 text-xs font-medium text-zinc-400">
                        Message
                      </p>
                      <p className="whitespace-pre-wrap text-sm text-zinc-300">
                        {msg.message}
                      </p>
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
