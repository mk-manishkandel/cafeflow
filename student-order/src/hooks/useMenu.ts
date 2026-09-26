import { useState, useEffect, useCallback } from 'react';
import { getStudentMenu } from '../services/api';
import type { MenuItem } from '../types';

interface MenuState {
  items: MenuItem[];
  categories: string[];
  loading: boolean;
  error: string | null;
}

export function useMenu(branchId: string | undefined) {
  const [state, setState] = useState<MenuState>({ items: [], categories: [], loading: false, error: null });

  const load = useCallback(async (id: string | undefined) => {
    setState(prev => ({ ...prev, loading: true, error: null }));
    try {
      const items = await getStudentMenu(id);
      const cats = Array.from(new Set(items.map(i => i.category).filter(Boolean))).sort();
      setState({ items, categories: cats, loading: false, error: null });
    } catch (err) {
      setState({ items: [], categories: [], loading: false, error: err instanceof Error ? err.message : 'Failed to load menu' });
    }
  }, []);

  useEffect(() => {
    void load(branchId);
  }, [branchId, load]);

  return { ...state, reload: () => load(branchId) };
}
