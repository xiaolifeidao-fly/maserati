import { ElectronApi, InvokeType, Protocols } from "../base";

/**
 * 查询案件详情参数
 */
export interface CaseDetailQuery {
  caseLoanId: string;
  mobile?: string;
  loanSource?: string;
}

/**
 * 案件时间线项
 */
export interface CaseTimelineItem {
  time: string;
  type: string;
  content: string;
}

/**
 * 还款记录
 */
export interface RepayRecord {
  repayDate?: string;
  repayAmount?: string;
  agentName?: string;
  remarks?: string;
}

/**
 * 案件详情
 */
export interface CaseDetail {
  caseLoanId: string;
  customerName?: string;
  mobile?: string;
  principalAmount?: number;
  outstandingAmount?: number;
  currency?: string;
  status?: string;
  overdueDays?: number;
  productName?: string;
  lastFollowUpAt?: string;
  nextActionAt?: string;
  tags?: string[];
  timeline?: CaseTimelineItem[];
  repayRegister?: RepayRecord[];
  raw?: unknown;
}

/**
 * 案件详情查询结果
 */
export interface CaseDetailResult {
  found: boolean;
  source: "mock" | "remote";
  detail?: CaseDetail;
  message?: string;
}

/**
 * 案件服务API
 */
export class CaseInfoApi extends ElectronApi {
  getApiName(): string {
    return "case_info";
  }

  /**
   * 获取案件详情
   */
  @InvokeType(Protocols.INVOKE)
  async getCaseDetail(query: CaseDetailQuery): Promise<CaseDetailResult> {
    return this.invokeApi("getCaseDetail", query);
  }
}
