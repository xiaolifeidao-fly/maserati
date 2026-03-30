/**
 * 验证码处理 Step —— 公共步骤, 由任意其他 Step 在遇到验证码时动态调用
 *
 * 扩展方式:
 *  - 子类覆盖 doValidate() 接入图像识别 / 人工介入 / 第三方打码平台
 *  - 默认实现: 通知前端等待用户手动处理, 完成后重试
 */
import log from 'electron-log';
import { PublishStep } from '../core/step.base';
import type { PublishContext, StepResult, CaptchaInfo } from '../types/pipeline.types';

export class CaptchaStep extends PublishStep {
  readonly name = 'CAPTCHA';

  constructor(private readonly captchaInfo: CaptchaInfo) {
    super();
  }

  protected async doExecute(ctx: PublishContext): Promise<StepResult> {
    log.info('[CaptchaStep] Handling captcha, url:', this.captchaInfo.validateUrl);

    try {
      const resolved = await this.doValidate(ctx, this.captchaInfo);
      if (resolved) {
        // 将验证后的请求头写回 context
        if (this.captchaInfo.headers) {
          ctx.requestHeaders = { ...(ctx.requestHeaders ?? {}), ...this.captchaInfo.headers };
        }
        log.info('[CaptchaStep] Captcha resolved successfully');
        return this.ok();
      }
      return this.fail('验证码处理失败, 需要人工介入');
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      log.error('[CaptchaStep] Error:', msg);
      return this.fail(`验证码处理异常: ${msg}`);
    }
  }

  /**
   * 验证码实际处理逻辑 —— 子类可替换
   * 返回 true 表示验证码已通过
   */
  protected async doValidate(
    _ctx: PublishContext,
    info: CaptchaInfo,
  ): Promise<boolean> {
    // TODO: 接入具体验证码处理逻辑
    // 方案 A: 调用图像识别服务自动解码
    // 方案 B: 通过 IPC 通知前端弹窗, 等待用户手动完成 (推荐)
    // 方案 C: 接入第三方打码平台
    log.warn('[CaptchaStep] No captcha solver configured, validateUrl:', info.validateUrl);
    return false;
  }
}
