"use client";

import { useState, useEffect, useRef } from "react";
import { useQuery } from "convex/react";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";

export function useGlobalSearch(userId: Id<"users"> | undefined) {
  const [searchTerm, setSearchTerm] = useState("");
  const [debouncedTerm, setDebouncedTerm] = useState("");
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      setDebouncedTerm(searchTerm);
    }, 300);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [searchTerm]);

  const results = useQuery(
    api.features.variables.queries.globalSearchWithAccess,
    // Identity is derived server-side from the attached JWT; `userId` gates the
    // query until the current user is known (auth ready).
    userId && debouncedTerm.length >= 2 ? { searchTerm: debouncedTerm } : "skip"
  );

  return {
    searchTerm,
    setSearchTerm,
    results: results ?? [],
    isLoading: debouncedTerm.length >= 2 && results === undefined,
  };
}
