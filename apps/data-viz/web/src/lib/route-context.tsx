import { createContext, useContext } from 'react';

import type { Route } from '../data/types';

export interface Router {
  route: Route;
  go: (route: Route, replace?: boolean) => void;
}

export const RouteContext = createContext<Router | null>(null);

export function useRoute(): Router {
  const value = useContext(RouteContext);
  if (!value) throw new Error('RouteContext is missing');
  return value;
}
