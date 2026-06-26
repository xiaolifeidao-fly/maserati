import { ElectronApi, InvokeType, Protocols } from "../base";

export interface ChromePathSetting {
  chromePath?: string;
}

export interface ChromePathSelectResult {
  cancelled: boolean;
  chromePath?: string;
}

export class SystemSettingsApi extends ElectronApi {
  getApiName(): string {
    return "systemSettings";
  }

  @InvokeType(Protocols.INVOKE)
  async getChromePathSetting(): Promise<ChromePathSetting> {
    return this.invokeApi("getChromePathSetting");
  }

  @InvokeType(Protocols.INVOKE)
  async selectChromeExecutable(): Promise<ChromePathSelectResult> {
    return this.invokeApi("selectChromeExecutable");
  }

  @InvokeType(Protocols.INVOKE)
  async saveChromePathSetting(chromePath: string): Promise<ChromePathSetting> {
    return this.invokeApi("saveChromePathSetting", chromePath);
  }

  @InvokeType(Protocols.INVOKE)
  async clearChromePathSetting(): Promise<ChromePathSetting> {
    return this.invokeApi("clearChromePathSetting");
  }
}
