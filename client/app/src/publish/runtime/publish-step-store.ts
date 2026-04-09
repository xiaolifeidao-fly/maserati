import { getGlobal, removeGlobal, setGlobal } from '@utils/store/electron';
import type { PublishStepRecord } from '../types/publish-task';

const STORAGE_KEY_PREFIX = 'publish_step_payload_v1';

type PersistedStepPayload = {
  inputData?: string;
  outputData?: string;
  updatedAt: string;
};

type PersistedTaskStepPayloads = Record<string, PersistedStepPayload>;

function buildStorageKey(taskId: number): string {
  return `${STORAGE_KEY_PREFIX}:${taskId}`;
}

function readTaskPayloads(taskId: number): PersistedTaskStepPayloads {
  const raw = getGlobal(buildStorageKey(taskId));
  if (!raw || typeof raw !== 'object') {
    return {};
  }
  return raw as PersistedTaskStepPayloads;
}

function persistTaskPayloads(taskId: number, payloads: PersistedTaskStepPayloads): void {
  if (Object.keys(payloads).length === 0) {
    removeGlobal(buildStorageKey(taskId));
    return;
  }
  setGlobal(buildStorageKey(taskId), payloads);
}

export function mergePublishStepPayloads(
  taskId: number,
  steps: PublishStepRecord[] | null | undefined,
): PublishStepRecord[] {
  if (!Array.isArray(steps) || steps.length === 0) {
    return [];
  }

  const payloads = readTaskPayloads(taskId);
  return steps.map((step) => {
    const payload = payloads[String(step.id)];
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
  const payloads = readTaskPayloads(taskId);
  const current = payloads[key] ?? { updatedAt: new Date().toISOString() };
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
    delete payloads[key];
  } else {
    payloads[key] = next;
  }

  persistTaskPayloads(taskId, payloads);
}

export function clearPublishStepPayloads(taskId: number): void {
  removeGlobal(buildStorageKey(taskId));
}
