// require('module-alias/register');
import 'reflect-metadata';

export const Protocols = {
  INVOKE : 'INVOKE',
  TRRIGER : 'TRRIGER'
}


export function InvokeType(invokeType : string) {
  return function (target: any, propertyKey: string, descriptor: PropertyDescriptor) {
      Reflect.defineMetadata('invokeType', invokeType, target, propertyKey);
  };
}


abstract class ElectronApi {

  apiName: string;

  windows : any;

  port: number = 0;

  windowId: string = '';

  consumers : {
    [key: string]: string
  } = {};


  constructor() {
    this.apiName = this.getApiName()
  }

  getEnvironment(): string {
    try{
      // @ts-ignore
      if(navigator == undefined){
         return 'Electron';
      }
      // @ts-ignore
      const userAgent = navigator.userAgent  
      if (userAgent.includes("Electron")) {
        return 'Electron';
      }
      return 'Browser';
    }catch(e){
      return 'Electron';
    }
  }
  
  getNamespace(): any {
    return undefined;
  }

  getWindows(){
    return this.windows
  }

  setWindows(windows: any){
    this.windows = windows
  }

  setPort(port: number): void {
    this.port = port;
  }

  getPort(): number {
    return this.port;
  }

  setWindowId(windowId: string): void {
    this.windowId = windowId;
  }

  getWindowId(): string {
    return this.windowId;
  }

  abstract getApiName(): string;
  

  jsonToObject(clazz: any, data: {}){
    if (data && typeof data === 'object') {
      return Object.assign(new clazz(), data);
    }
    return data;
  }

  send(key : string, ...args: any): void{
    const channel = this.buildKey(key);
    this.sendMessage(channel, ...args)
  }

  buildKey(key : string){
    let namespace = this.getNamespace();
    let rendererApiName = this.getApiName();
    if(namespace){
      rendererApiName = namespace + "_" + rendererApiName;
    }
    return `${rendererApiName}.${key}`;
  }

  sendMessage(channel: string, ...args: any): void{
    this.getWindows().webContents.send(channel, ...args);
  }

  async invokeApi(functionName : string, ...args : any){
      const env = this.getEnvironment();
      if(env == 'Electron'){
          let apiName = this.getApiName();
          if(this.getNamespace()){
              apiName = this.getNamespace() + "_" + apiName;
          }
          //@ts-ignore
          const rendererApi = window[apiName];
          if (!rendererApi || typeof rendererApi[functionName] !== 'function') {
            throw new Error(`electron api '${apiName}.${functionName}' is not available`);
          }
          return await rendererApi[functionName](...args);
      }
      return {};
  }

  @InvokeType(Protocols.INVOKE)
  async removeOnMessage(apiName : string, functionName : string){ 
    try{  
      return await this.invokeApi("removeOnMessage", apiName, functionName);
    }catch(e : any){
        
    }
  }

  async onMessage(functionName : string, callback : (...args: any) => void, topic : string|undefined = undefined){
    const env = this.getEnvironment();
    if(env == 'Electron'){
        let apiName = this.getApiName();
        if(this.getNamespace() != undefined){
            apiName = this.getNamespace() + "_" + apiName;
        }
        await this.removeOnMessage(apiName, functionName);
        //@ts-ignore
        const rendererApi = window[apiName];
        if (!rendererApi || typeof rendererApi[functionName] !== 'function') {
          throw new Error(`electron api '${apiName}.${functionName}' is not available`);
        }
        return await rendererApi[functionName](callback);
    }
    return {};
  }

}

export {
  ElectronApi
}
