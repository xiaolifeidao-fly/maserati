import { requestBackend } from '@src/impl/shared/backend';
import type {
  PublishTaskRecord,
  PublishStepRecord,
  CreatePublishStepPayload,
  UpdatePublishTaskPayload,
  UpdatePublishStepPayload,
} from '../types/publish-task';
import {
  mergePublishStepPayloads,
  persistPublishStepPayload,
} from '../runtime/publish-step-store';
import type { IPublishPersister } from './publish-runner';

/**
 * HttpPublishPersister — 通过 HTTP 调用服务端接口持久化发布状态
 */
export class HttpPublishPersister implements IPublishPersister {
  async getTask(taskId: number): Promise<PublishTaskRecord> {
    return requestBackend<PublishTaskRecord>('GET', `/publish-tasks/${taskId}`, {
      publishLog: { taskId, label: 'get publish task' },
    });
  }

  async updateTask(taskId: number, payload: UpdatePublishTaskPayload): Promise<PublishTaskRecord> {
    return requestBackend<PublishTaskRecord>('PUT', `/publish-tasks/${taskId}`, {
      data: payload,
      publishLog: { taskId, label: 'update publish task' },
    });
  }

  async listSteps(taskId: number): Promise<PublishStepRecord[]> {
    const steps = await requestBackend<PublishStepRecord[]>('GET', `/publish-tasks/${taskId}/steps`, {
      publishLog: { taskId, label: 'list publish steps' },
    });
    return mergePublishStepPayloads(taskId, steps);
  }

  async createStep(taskId: number, payload: CreatePublishStepPayload): Promise<PublishStepRecord> {
    const { inputData, ...serverPayload } = payload;
    const step = await requestBackend<PublishStepRecord>('POST', `/publish-tasks/${taskId}/steps`, {
      data: serverPayload,
      publishLog: { taskId, label: `create publish step:${payload.stepCode}` },
    });
    if (inputData !== undefined && step.id) {
      persistPublishStepPayload(taskId, step.id, { inputData });
    }
    return mergePublishStepPayloads(taskId, [step])[0] ?? step;
  }

  async updateStep(
    taskId: number,
    stepId: number,
    payload: UpdatePublishStepPayload,
  ): Promise<PublishStepRecord> {
    const { inputData, outputData, ...serverPayload } = payload;
    const step = await requestBackend<PublishStepRecord>(
      'PUT',
      `/publish-tasks/${taskId}/steps/${stepId}`,
      {
        data: serverPayload,
        publishLog: { taskId, label: `update publish step:${stepId}` },
      },
    );
    if (inputData !== undefined || outputData !== undefined) {
      persistPublishStepPayload(taskId, stepId, { inputData, outputData });
    }
    return mergePublishStepPayloads(taskId, [step])[0] ?? step;
  }
}
