/**
 * edit-draft.step.ts
 * Step 5: 二次编辑草稿（浏览器自动化层）
 *
 * 将 context.draft 的内容通过浏览器自动化（pageDriver）填入目标平台的草稿编辑页，
 * 并将各 Filler 对应的 UI 操作也模块化为 IDraftFiller 的浏览器版本（UIFiller）。
 *
 * 注意：此步骤可能触发验证码（平台在编辑时做人机检测），
 * 通过在 IUIFiller.fill 中抛出 CaptchaRequiredError 来触发。
 *
 * 设计：
 *  - UIFillerRegistry（与数据层 FillerRegistry 分离，复用相同接口但操作 DOM）
 *  - 每个 UIFiller 负责一个 UI 区块的填充（主图/标题、属性、SKU、物流、详情）
 */

import { PublishStep, type StepResult } from '../core/publish-step';
import { StepContext }                   from '../core/step-context';
import { StepPreconditionError }         from '../core/errors';
import { StepName }                      from '../types/publish-task';

// ────────────────────────────────────────────────
// UI 填充器接口
// ────────────────────────────────────────────────

export interface IUIFiller {
  /** 填充器名称（用于日志） */
  readonly name: string;

  /**
   * 在目标平台页面（pageDriver）中填充对应 UI 区块
   * @throws CaptchaRequiredError 若过程中遇到验证码
   */
  fill(context: StepContext): Promise<void>;
}

// ────────────────────────────────────────────────
// UI 填充器注册表
// ────────────────────────────────────────────────

export class UIFillerRegistry {
  private readonly fillers: IUIFiller[] = [];

  register(...fillers: IUIFiller[]): this {
    this.fillers.push(...fillers);
    return this;
  }

  getAll(): IUIFiller[] {
    return [...this.fillers];
  }
}

// ────────────────────────────────────────────────
// EditDraftStep
// ────────────────────────────────────────────────

export interface IEditDraftDriver {
  /**
   * 打开草稿编辑页
   * @param draftId 草稿 ID（无 draftId 则打开新建页）
   */
  openEditPage(draftId: string | undefined, context: StepContext): Promise<void>;

  /**
   * 保存草稿（点击"保存"按钮等操作）
   * @returns 保存后的草稿 ID
   */
  saveDraft(context: StepContext): Promise<string>;
}

export interface EditDraftStepOptions {
  driver:           IEditDraftDriver;
  uiFillerRegistry: UIFillerRegistry;
}

export class EditDraftStep extends PublishStep {
  readonly name = StepName.EDIT_DRAFT;

  private readonly driver:           IEditDraftDriver;
  private readonly uiFillerRegistry: UIFillerRegistry;

  constructor(options: EditDraftStepOptions) {
    super({ maxRetries: 2, resumable: false }); // 浏览器操作不适合跳过
    this.driver           = options.driver;
    this.uiFillerRegistry = options.uiFillerRegistry;
  }

  protected async beforeExecute(context: StepContext): Promise<void> {
    if (!context.draft) {
      throw new StepPreconditionError(this.name, 'draft is required (run FillDraftStep first)');
    }
  }

  protected async doExecute(context: StepContext): Promise<StepResult> {
    // ── 打开编辑页 ────────────────────────────────────────────────
    await this.driver.openEditPage(context.draftId, context);

    // ── 逐个 UIFiller 操作 UI ─────────────────────────────────────
    const fillers = this.uiFillerRegistry.getAll();
    for (const filler of fillers) {
      console.log(`[EditDraftStep] Filling UI section: ${filler.name}`);
      // CaptchaRequiredError 自然冒泡 → StepChain 捕获
      await filler.fill(context);
    }

    // ── 保存草稿 ─────────────────────────────────────────────────
    const savedDraftId = await this.driver.saveDraft(context);
    context.draftId    = savedDraftId;

    console.log(`[EditDraftStep] Draft saved, draftId=${savedDraftId}`);

    return { success: true };
  }
}
