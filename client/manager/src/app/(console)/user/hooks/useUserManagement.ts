"use client";

import { useEffect, useState } from "react";
import {
  createUser,
  deleteUser,
  fetchUserDetail,
  fetchUserStats,
  fetchUsers,
  type UserListQuery,
  type UserPayload,
  type UserRecord,
  type UserStats,
  updateUser,
} from "../api/user.api";

const defaultStats: UserStats = {
  visibleUsers: 0,
  privilegedUsers: 0,
  recentLoginUsers: 0,
  activeUsers: 0,
};

const defaultQuery: Required<UserListQuery> = {
  pageIndex: 1,
  pageSize: 10,
  search: "",
  role: "",
  status: "",
};

export function useUserManagement() {
  const [users, setUsers] = useState<UserRecord[]>([]);
  const [stats, setStats] = useState<UserStats>(defaultStats);
  const [loading, setLoading] = useState(false);
  const [statsLoading, setStatsLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [total, setTotal] = useState(0);
  const [query, setQuery] = useState<Required<UserListQuery>>(defaultQuery);

  const loadUsers = async (nextQuery?: Partial<UserListQuery>) => {
    const mergedQuery = { ...query, ...nextQuery };
    setLoading(true);
    try {
      const result = await fetchUsers(mergedQuery);
      setUsers(result.data);
      setTotal(result.total);
      setQuery(mergedQuery);
    } finally {
      setLoading(false);
    }
  };

  const loadStats = async () => {
    setStatsLoading(true);
    try {
      const result = await fetchUserStats();
      setStats(result);
    } finally {
      setStatsLoading(false);
    }
  };

  const refresh = async (nextQuery?: Partial<UserListQuery>) => {
    await Promise.all([loadUsers(nextQuery), loadStats()]);
  };

  const loadDetail = async (id: number) => {
    return fetchUserDetail(id);
  };

  const saveUser = async (id: number | null, payload: UserPayload) => {
    setSubmitting(true);
    try {
      if (id === null) {
        await createUser(payload);
      } else {
        await updateUser(id, payload);
      }
      await refresh();
    } finally {
      setSubmitting(false);
    }
  };

  const patchUser = async (id: number, payload: Partial<UserPayload>) => {
    setSubmitting(true);
    try {
      await updateUser(id, payload);
      await refresh();
    } finally {
      setSubmitting(false);
    }
  };

  const removeUser = async (id: number) => {
    setSubmitting(true);
    try {
      await deleteUser(id);
      const nextPage =
        users.length === 1 && query.pageIndex > 1 ? query.pageIndex - 1 : query.pageIndex;
      await refresh({ pageIndex: nextPage });
    } finally {
      setSubmitting(false);
    }
  };

  useEffect(() => {
    void refresh();
  }, []);

  return {
    users,
    stats,
    total,
    query,
    loading,
    statsLoading,
    submitting,
    refresh,
    loadUsers,
    loadDetail,
    saveUser,
    patchUser,
    removeUser,
    setQuery,
  };
}
