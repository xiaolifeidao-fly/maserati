import { CaptchaRequiredError } from '../core/errors';
import type { StepCode } from '../types/publish-task';

/**
 * CaptchaChecker — 验证码公共检测工具（非独立步骤）
 *
 * 各步骤在执行过程中，检测到响应中包含验证码特征时，
 * 调用 CaptchaChecker.check() 抛出 CaptchaRequiredError，
 * 由 StepChain 统一捕获并暂停流程。
 *
 * 使用示例（在任意步骤的 doExecute 中）：
 *
 *   const response = await someRequest();
 *   CaptchaChecker.check(this.stepCode, response);
 */
export class CaptchaChecker {
  /**
   * 检查 HTTP 响应体是否包含验证码特征
   * 若需要验证码则抛出 CaptchaRequiredError
   */
  static check(
    stepCode: StepCode,
    responseBody: string | Record<string, unknown>,
  ): void {
    const body = typeof responseBody === 'string' ? responseBody : JSON.stringify(responseBody);

    // 淘宝验证码特征检测
    const captchaUrl = CaptchaChecker.extractCaptchaUrl(body);
    if (captchaUrl) {
      const validateUrl = CaptchaChecker.extractValidateUrl(body);
      throw new CaptchaRequiredError(stepCode, captchaUrl, validateUrl);
    }
  }

  /**
   * 直接抛出验证码错误（已明确有验证码时使用）
   */
  static require(stepCode: StepCode, captchaUrl: string, validateUrl?: string): never {
    throw new CaptchaRequiredError(stepCode, captchaUrl, validateUrl);
  }

  private static extractCaptchaUrl(body: string): string | null {
    // 淘宝返回的验证码图片 URL 特征
    const patterns = [
      /captcha[?&][^"'\s]*/i,
      /checkcode[?&][^"'\s]*/i,
      /"captchaUrl"\s*:\s*"([^"]+)"/,
      /"img"\s*:\s*"(https?:\/\/[^"]*captcha[^"]*)"/i,
    ];
    for (const pattern of patterns) {
      const match = body.match(pattern);
      if (match) return match[1] ?? match[0];
    }
    return null;
  }

  private static extractValidateUrl(body: string): string | undefined {
    const match = body.match(/"validateUrl"\s*:\s*"([^"]+)"/);
    return match?.[1];
  }
}
