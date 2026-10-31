export interface TrashItem {
  id: string;
  name: string;
  originalPath: string;
  isDirectory: boolean;
  deletedAt: string;
  size: number;
}

export interface OpenTabRecord {
  id: string;
  userId: string;
  tabType: string;
  hostId: number | null;
  label: string;
  tabOrder: number;
  backendSessionId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface OpenTabUpsertPayload {
  id: string;
  tabType: string;
  hostId?: number | null;
  label: string;
  tabOrder: number;
  backendSessionId?: string | null;
}

export interface ActiveSessionInfo {
  sessionId: string;
  hostId: number;
  hostName: string;
  tabInstanceId: string | null;
  isConnected: boolean;
  createdAt: number;
}

export interface ApiKey {
  id: string;
  name: string;
  createdAt: string;
  lastUsedAt: string | null;
  expiresAt: string | null;
}
