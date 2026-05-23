/**
 * 批次发布任务登录门控：
 *  - 批次任务检测到登录过期时通过 createLoginGate 挂起当前循环
 *  - 用户在 UI 点击"处理"并完成登录后，主进程调用 resolveLoginGate 放行
 *  - 单任务（非批次）不使用此机制，由 resumePublish 直接重启 runner
 */
const pendingGates = new Map<number, () => void>();

export function createLoginGate(taskId: number): Promise<void> {
  return new Promise<void>((resolve) => {
    pendingGates.set(taskId, resolve);
  });
}

/**
 * 放行登录门控，返回 true 表示确实存在待放行的批次任务。
 */
export function resolveLoginGate(taskId: number): boolean {
  const resolve = pendingGates.get(taskId);
  if (!resolve) return false;
  pendingGates.delete(taskId);
  resolve();
  return true;
}
