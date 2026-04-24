import { app } from 'electron';
import fs from 'fs';
import path from 'path';
import { getGlobal, removeGlobal, setGlobal } from '@utils/store/electron';
import type { PublishStepRecord } from '../types/publish-task';

const LEGACY_STORAGE_KEY_PREFIX = 'publish_step_payload_v1';
const INDEX_STORAGE_KEY_PREFIX = 'publish_step_payload_index_v1';
const PAYLOAD_STORAGE_DIR = 'publish-step-payloads';

type PersistedStepPayload = {
  inputData?: string;
  outputData?: string;
  updatedAt: string;
};

type PersistedStepPayloadIndex = {
  hasInputData?: boolean;
  hasOutputData?: boolean;
  payloadPath: string;
  updatedAt: string;
};

type PersistedTaskPayloadIndex = Record<string, PersistedStepPayloadIndex>;

function buildLegacyStorageKey(taskId: number): string {
  return `${LEGACY_STORAGE_KEY_PREFIX}:${taskId}`;
}

function buildIndexStorageKey(taskId: number): string {
  return `${INDEX_STORAGE_KEY_PREFIX}:${taskId}`;
}

function getTaskPayloadDir(taskId: number): string {
  return path.join(app.getPath('userData'), PAYLOAD_STORAGE_DIR, String(taskId));
}

function getStepPayloadPath(taskId: number, stepId: number): string {
  return path.join(getTaskPayloadDir(taskId), `${stepId}.json`);
}

function readIndex(taskId: number): PersistedTaskPayloadIndex {
  const raw = getGlobal(buildIndexStorageKey(taskId));
  if (!raw || typeof raw !== 'object') {
    return {};
  }
  return raw as PersistedTaskPayloadIndex;
}

function persistIndex(taskId: number, index: PersistedTaskPayloadIndex): void {
  if (Object.keys(index).length === 0) {
    removeGlobal(buildIndexStorageKey(taskId));
    return;
  }
  setGlobal(buildIndexStorageKey(taskId), index);
}

function readPayloadFile(filePath: string): PersistedStepPayload | undefined {
  if (!fs.existsSync(filePath)) {
    return undefined;
  }
  const text = fs.readFileSync(filePath, 'utf8');
  if (!text.trim()) {
    return undefined;
  }
  const data = JSON.parse(text) as PersistedStepPayload;
  return data && typeof data === 'object' ? data : undefined;
}

function writePayloadFile(filePath: string, payload: PersistedStepPayload): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(payload), 'utf8');
}

function removePayloadFile(filePath: string): void {
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
  }
}

function readLegacyPayloads(taskId: number): Record<string, PersistedStepPayload> {
  const raw = getGlobal(buildLegacyStorageKey(taskId));
  if (!raw || typeof raw !== 'object') {
    return {};
  }
  return raw as Record<string, PersistedStepPayload>;
}

function buildIndexEntry(payloadPath: string, payload: PersistedStepPayload): PersistedStepPayloadIndex {
  return {
    payloadPath,
    updatedAt: payload.updatedAt,
    hasInputData: payload.inputData !== undefined,
    hasOutputData: payload.outputData !== undefined,
  };
}

function migrateLegacyPayloads(taskId: number, index: PersistedTaskPayloadIndex): PersistedTaskPayloadIndex {
  const legacyPayloads = readLegacyPayloads(taskId);
  if (Object.keys(legacyPayloads).length === 0) {
    return index;
  }

  const nextIndex = { ...index };
  for (const [stepIdText, payload] of Object.entries(legacyPayloads)) {
    const stepId = Number(stepIdText);
    if (!Number.isFinite(stepId) || !payload || typeof payload !== 'object') {
      continue;
    }
    const payloadPath = getStepPayloadPath(taskId, stepId);
    let existingPayload: PersistedStepPayload | undefined;
    try {
      existingPayload = readPayloadFile(payloadPath);
    } catch {
      existingPayload = undefined;
    }
    const nextPayload = existingPayload ?? payload;
    if (nextPayload.inputData === undefined && nextPayload.outputData === undefined) {
      continue;
    }
    writePayloadFile(payloadPath, nextPayload);
    nextIndex[stepIdText] = buildIndexEntry(payloadPath, nextPayload);
  }

  removeGlobal(buildLegacyStorageKey(taskId));
  persistIndex(taskId, nextIndex);
  return nextIndex;
}

function readTaskPayloadIndex(taskId: number): PersistedTaskPayloadIndex {
  return migrateLegacyPayloads(taskId, readIndex(taskId));
}

function readStepPayload(
  taskId: number,
  stepId: number,
  indexEntry?: PersistedStepPayloadIndex,
): PersistedStepPayload | undefined {
  const defaultPayloadPath = getStepPayloadPath(taskId, stepId);
  const payloadPath = indexEntry?.payloadPath || defaultPayloadPath;
  try {
    return readPayloadFile(payloadPath) ?? (
      payloadPath === defaultPayloadPath ? undefined : readPayloadFile(defaultPayloadPath)
    );
  } catch {
    return undefined;
  }
}

export function mergePublishStepPayloads(
  taskId: number,
  steps: PublishStepRecord[] | null | undefined,
): PublishStepRecord[] {
  if (!Array.isArray(steps) || steps.length === 0) {
    return [];
  }

  const index = readTaskPayloadIndex(taskId);
  return steps.map((step) => {
    const payload = readStepPayload(taskId, step.id, index[String(step.id)]);
    if (!payload) {
      return step;
    }
    return {
      ...step,
      inputData: payload.inputData ?? step.inputData,
      outputData: payload.outputData ?? step.outputData,
    };
  });
}

export function persistPublishStepPayload(
  taskId: number,
  stepId: number,
  patch: {
    inputData?: string;
    outputData?: string;
  },
): void {
  const key = String(stepId);
  const index = readTaskPayloadIndex(taskId);
  const payloadPath = getStepPayloadPath(taskId, stepId);
  const current = readStepPayload(taskId, stepId, index[key]) ?? { updatedAt: new Date().toISOString() };
  const next: PersistedStepPayload = {
    ...current,
    updatedAt: new Date().toISOString(),
  };

  if (patch.inputData !== undefined) {
    next.inputData = patch.inputData;
  }
  if (patch.outputData !== undefined) {
    next.outputData = patch.outputData;
  }

  if (next.inputData === undefined && next.outputData === undefined) {
    removePayloadFile(payloadPath);
    delete index[key];
  } else {
    writePayloadFile(payloadPath, next);
    index[key] = buildIndexEntry(payloadPath, next);
  }

  persistIndex(taskId, index);
}

export function clearPublishStepPayloads(taskId: number): void {
  removeGlobal(buildLegacyStorageKey(taskId));
  removeGlobal(buildIndexStorageKey(taskId));
  fs.rmSync(getTaskPayloadDir(taskId), { recursive: true, force: true });
}
