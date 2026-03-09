"use client";

import { useState, useEffect } from "react";
import { Modal } from "@/components/ui";
import type { Id } from "../../../convex/_generated/dataModel";

interface VersionRecord {
  _id: Id<"variableVersions">;
  version: number;
  description?: string;
  environments: string[];
  changeReason?: string;
  createdAt: number;
  changedByUser: { name?: string; email: string } | null;
}

interface VariableHistoryProps {
  isOpen: boolean;
  onClose: () => void;
  variableKey: string;
  currentVersion: number;
  history: VersionRecord[];
  onRollback: (targetVersion: number) => Promise<void>;
  canRollback: boolean;
  isLoading?: boolean;
  error?: string | null;
}

type FilterType = "all" | "updates" | "rollbacks";

export function VariableHistory({
  isOpen,
  onClose,
  variableKey,
  currentVersion,
  history,
  onRollback,
  canRollback,
  isLoading = false,
  error = null,
}: VariableHistoryProps) {
  const [isRollingBack, setIsRollingBack] = useState(false);
  const [rollbackTarget, setRollbackTarget] = useState<number | null>(null);
  const [filterType, setFilterType] = useState<FilterType>("all");
  const [compareMode, setCompareMode] = useState(false);
  const [selectedVersions, setSelectedVersions] = useState<number[]>([]);

  const formatDate = (timestamp: number) => {
    return new Intl.DateTimeFormat("en-US", {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(timestamp));
  };

  const formatRelativeTime = (timestamp: number) => {
    const now = Date.now();
    const diff = now - timestamp;
    const seconds = Math.floor(diff / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 7) return formatDate(timestamp);
    if (days > 0) return `${days} day${days > 1 ? "s" : ""} ago`;
    if (hours > 0) return `${hours} hour${hours > 1 ? "s" : ""} ago`;
    if (minutes > 0) return `${minutes} minute${minutes > 1 ? "s" : ""} ago`;
    return "Just now";
  };

  const isRollback = (changeReason?: string) => {
    return changeReason?.toLowerCase().includes("rolled back") || false;
  };

  const filteredHistory = history.filter((record) => {
    if (filterType === "all") return true;
    if (filterType === "rollbacks") return isRollback(record.changeReason);
    if (filterType === "updates") return !isRollback(record.changeReason);
    return true;
  });

  const handleRollback = async (version: number) => {
    if (!canRollback) return;

    setIsRollingBack(true);
    setRollbackTarget(version);
    try {
      await onRollback(version);
      onClose();
    } catch {
      // Rollback error is handled by the caller
    } finally {
      setIsRollingBack(false);
      setRollbackTarget(null);
    }
  };

  const toggleVersionSelection = (version: number) => {
    setSelectedVersions((prev) => {
      if (prev.includes(version)) {
        return prev.filter((v) => v !== version);
      }
      if (prev.length >= 2) {
        return [prev[1], version];
      }
      return [...prev, version];
    });
  };

  const getCompareVersions = () => {
    if (selectedVersions.length !== 2) return null;
    const sorted = [...selectedVersions].sort((a, b) => a - b);
    const olderVersion = history.find((h) => h.version === sorted[0]);
    const newerVersion = history.find((h) => h.version === sorted[1]);
    // Return null if either version is not found
    if (!olderVersion || !newerVersion) return null;
    return { older: olderVersion, newer: newerVersion };
  };

  const compareVersions = getCompareVersions();

  // Reset state when modal closes
  useEffect(() => {
    if (!isOpen) {
      setFilterType("all");
      setCompareMode(false);
      setSelectedVersions([]);
    }
  }, [isOpen]);

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`Version History: ${variableKey}`}
      size="xl"
    >
      {/* Filter and Compare Controls */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2 border-b border-zinc-200 pb-4 dark:border-zinc-800">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
            Filter:
          </span>
          {(["all", "updates", "rollbacks"] as FilterType[]).map((type) => (
            <button
              key={type}
              onClick={() => setFilterType(type)}
              className={`rounded-md px-2 py-1 text-xs font-medium capitalize transition-colors ${
                filterType === type
                  ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                  : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-700"
              }`}
            >
              {type}
            </button>
          ))}
        </div>
        <button
          onClick={() => {
            setCompareMode(!compareMode);
            setSelectedVersions([]);
          }}
          className={`flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium transition-colors ${
            compareMode
              ? "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400"
              : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-700"
          }`}
        >
          <svg
            className="h-3 w-3"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
            />
          </svg>
          Compare
        </button>
      </div>

      {/* Compare Mode Instructions */}
      {compareMode && (
        <div className="mb-4 rounded-lg bg-blue-50 p-3 text-sm text-blue-700 dark:bg-blue-900/20 dark:text-blue-400">
          <p className="font-medium">Compare Mode</p>
          <p className="mt-1 text-xs">
            Select two versions to compare.{" "}
            {selectedVersions.length === 0 &&
              "Click on version badges to select."}
            {selectedVersions.length === 1 &&
              "Select one more version to compare."}
            {selectedVersions.length === 2 && "Comparison shown below."}
          </p>
        </div>
      )}

      {/* Comparison View */}
      {compareMode && compareVersions && (
        <div className="mb-4 rounded-lg border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-700 dark:bg-zinc-800/50">
          <h4 className="mb-3 text-sm font-semibold text-zinc-900 dark:text-zinc-100">
            Comparing v{compareVersions.older.version} → v
            {compareVersions.newer.version}
          </h4>
          <div className="grid grid-cols-2 gap-4 text-xs">
            <div>
              <span className="font-medium text-zinc-500 dark:text-zinc-400">
                Older (v{compareVersions.older.version})
              </span>
              <div className="mt-2 space-y-2">
                <div>
                  <span className="text-zinc-400">Environments:</span>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {compareVersions.older.environments.map((env) => (
                      <span
                        key={env}
                        className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                          !compareVersions.newer.environments.includes(env)
                            ? "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
                            : "bg-zinc-100 text-zinc-600 dark:bg-zinc-700 dark:text-zinc-300"
                        }`}
                      >
                        {env}
                      </span>
                    ))}
                  </div>
                </div>
                {compareVersions.older.description && (
                  <div>
                    <span className="text-zinc-400">Description:</span>
                    <p className="mt-1 text-zinc-700 dark:text-zinc-300">
                      {compareVersions.older.description}
                    </p>
                  </div>
                )}
              </div>
            </div>
            <div>
              <span className="font-medium text-zinc-500 dark:text-zinc-400">
                Newer (v{compareVersions.newer.version})
              </span>
              <div className="mt-2 space-y-2">
                <div>
                  <span className="text-zinc-400">Environments:</span>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {compareVersions.newer.environments.map((env) => (
                      <span
                        key={env}
                        className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                          !compareVersions.older.environments.includes(env)
                            ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                            : "bg-zinc-100 text-zinc-600 dark:bg-zinc-700 dark:text-zinc-300"
                        }`}
                      >
                        {env}
                      </span>
                    ))}
                  </div>
                </div>
                {compareVersions.newer.description && (
                  <div>
                    <span className="text-zinc-400">Description:</span>
                    <p className="mt-1 text-zinc-700 dark:text-zinc-300">
                      {compareVersions.newer.description}
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="max-h-96 overflow-y-auto">
        {/* Error State */}
        {error ? (
          <div className="flex flex-col items-center justify-center py-12">
            <div className="rounded-full bg-red-100 p-3 dark:bg-red-900/20">
              <svg
                className="h-6 w-6 text-red-600 dark:text-red-400"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                />
              </svg>
            </div>
            <p className="mt-3 text-sm font-medium text-red-600 dark:text-red-400">
              {error}
            </p>
          </div>
        ) : isLoading ? (
          <div className="flex flex-col items-center justify-center py-12">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-zinc-300 border-t-zinc-900 dark:border-zinc-700 dark:border-t-zinc-100" />
            <p className="mt-3 text-sm text-zinc-500 dark:text-zinc-400">
              Loading version history...
            </p>
          </div>
        ) : filteredHistory.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12">
            <div className="rounded-full bg-zinc-100 p-3 dark:bg-zinc-800">
              <svg
                className="h-6 w-6 text-zinc-400"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
            </div>
            <p className="mt-3 text-sm font-medium text-zinc-900 dark:text-zinc-100">
              {history.length === 0
                ? "No version history"
                : "No matching versions"}
            </p>
            <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
              {history.length === 0
                ? "This variable has no recorded changes yet."
                : `Try changing the filter to see other versions.`}
            </p>
          </div>
        ) : (
          <div className="divide-y divide-zinc-200 dark:divide-zinc-800">
            {filteredHistory.map((record) => (
              <div
                key={record._id}
                className={`flex items-start justify-between py-4 transition-colors ${
                  compareMode && selectedVersions.includes(record.version)
                    ? "bg-blue-50 dark:bg-blue-900/10"
                    : ""
                }`}
              >
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() =>
                        compareMode && toggleVersionSelection(record.version)
                      }
                      disabled={!compareMode}
                      className={`rounded-full px-2 py-0.5 text-xs font-medium transition-colors ${
                        compareMode
                          ? selectedVersions.includes(record.version)
                            ? "bg-blue-500 text-white ring-2 ring-blue-300 dark:ring-blue-700"
                            : "bg-zinc-100 text-zinc-700 hover:bg-blue-100 hover:text-blue-700 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-blue-900/30 dark:hover:text-blue-400"
                          : "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
                      }`}
                    >
                      v{record.version}
                    </button>
                    {record.version === currentVersion && (
                      <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700 dark:bg-green-900/30 dark:text-green-400">
                        Current
                      </span>
                    )}
                    {isRollback(record.changeReason) && (
                      <span className="rounded-full bg-purple-100 px-2 py-0.5 text-xs font-medium text-purple-700 dark:bg-purple-900/30 dark:text-purple-400">
                        Rollback
                      </span>
                    )}
                  </div>

                  <div className="mt-2 flex flex-wrap gap-1">
                    {record.environments.map((env) => (
                      <span
                        key={env}
                        className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                          env === "production"
                            ? "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
                            : env === "staging"
                              ? "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400"
                              : "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                        }`}
                      >
                        {env}
                      </span>
                    ))}
                  </div>

                  {record.changeReason && (
                    <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
                      <span className="font-medium">Reason:</span>{" "}
                      {record.changeReason}
                    </p>
                  )}

                  {record.description && (
                    <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-500">
                      <span className="font-medium">Description:</span>{" "}
                      {record.description}
                    </p>
                  )}

                  <div className="mt-2 flex items-center gap-2 text-xs text-zinc-400 dark:text-zinc-500">
                    <svg
                      className="h-3 w-3"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={2}
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                      />
                    </svg>
                    <span title={formatDate(record.createdAt)}>
                      {formatRelativeTime(record.createdAt)}
                    </span>
                    {record.changedByUser && (
                      <>
                        <span>•</span>
                        <div className="flex items-center gap-1">
                          <svg
                            className="h-3 w-3"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                            strokeWidth={2}
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
                            />
                          </svg>
                          <span className="font-medium">
                            {record.changedByUser.name ||
                              record.changedByUser.email}
                          </span>
                        </div>
                      </>
                    )}
                  </div>
                </div>

                {!compareMode &&
                  record.version !== currentVersion &&
                  canRollback && (
                    <button
                      onClick={() => handleRollback(record.version)}
                      disabled={isRollingBack}
                      className="ml-4 flex items-center gap-1 rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 shadow-sm transition-colors hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
                    >
                      {isRollingBack && rollbackTarget === record.version ? (
                        <>
                          <div className="h-3 w-3 animate-spin rounded-full border border-zinc-400 border-t-zinc-700" />
                          Rolling back...
                        </>
                      ) : (
                        <>
                          <svg
                            className="h-3 w-3"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                            strokeWidth={2}
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6"
                            />
                          </svg>
                          Rollback
                        </>
                      )}
                    </button>
                  )}
              </div>
            ))}
          </div>
        )}
      </div>
    </Modal>
  );
}
