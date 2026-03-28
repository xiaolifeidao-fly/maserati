
// require('module-alias/register');
const { contextBridge, ipcRenderer } = require('electron');
import { ElectronApi, Protocols } from '@eleapi/base';
import { registerApi } from '@eleapi/register';
import 'reflect-metadata';

 // 定义一个类型，将暴露给渲染进程的 API 类型化
type ExposedApi = {
  [K in keyof ElectronApi]: ElectronApi[K] extends (...args: infer Args) => infer Return
    ? (...args: Args) => Promise<Return>
    : never;
};

function preloadDebug(message: string, extra?: Record<string, unknown>) {
  if (extra) {
    console.log(`[preload] ${message}`, JSON.stringify(extra));
    return;
  }
  console.log(`[preload] ${message}`);
}

function exposeByPrototype(apiName: string, prototype : any, exposedConfig : ExposedApi){
  Object.getOwnPropertyNames(prototype)
    .filter((key) => key !== 'constructor') // 排除构造函数
    .forEach((methodName) => {
      const method = (prototype as any)[methodName];
      const metadata = Reflect.getMetadata('invokeType', prototype, methodName);

      if (typeof method === 'function') {
        // 使用 ipcRenderer.invoke 封装方法
        if(metadata == undefined || metadata == Protocols.INVOKE){
            (exposedConfig as any)[methodName] = (...args: any) => {
              if(methodName == "removeOnMessage"){
                const removeKey = `${args[0]}.${args[1]}`;
                ipcRenderer.removeAllListeners(removeKey);
                preloadDebug("removed ipc listeners", {
                  apiName,
                  removeKey,
                });
                return;

              }
              preloadDebug("invoke renderer api", {
                apiName,
                methodName,
                argCount: args.length,
              });
              return ipcRenderer.invoke(`${apiName}.${methodName}`, ...args);
            };
        }else{
            preloadDebug("register trigger api listener", {
              apiName,
              methodName,
            });
            (exposedConfig as any)[methodName] = (callback: (...args: any) => void) => {
              ipcRenderer.on(`${apiName}.${methodName}`, (event : any, ...args: any) => {
                  preloadDebug("received trigger api event", {
                    apiName,
                    methodName,
                    argCount: args.length,
                  });
                  callback(...args); // 将参数传递给回调函数
              });
            };
        }
      }
    });
}

function exposeApi(apiName: string, cls: { new(...args: any[]): ElectronApi }) {
  const exposedConfig = {} as ExposedApi;
  const prototype = cls.prototype; // 通过类获取原型
  const parentPrototype = Object.getPrototypeOf(prototype); // 获取父类的原型

  exposeByPrototype(apiName, prototype, exposedConfig);

  exposeByPrototype(apiName, parentPrototype, exposedConfig);

  return exposedConfig;
}

async function registerRenderApi(cls: { new(...args: any[]): ElectronApi }){
  const registerInstance = new cls();
  const apiName = registerInstance.getApiName();
  const namespace = registerInstance.getNamespace();
  let rendererApiName = apiName;
  if(namespace){
    rendererApiName = namespace + "_" + apiName;
  }
  const exposedConfig = exposeApi(rendererApiName, cls)
  contextBridge.exposeInMainWorld(apiName, (exposedConfig as ExposedApi));
  preloadDebug("exposed api on window", {
    apiName,
    rendererApiName,
  });
  if (rendererApiName !== apiName) {
    contextBridge.exposeInMainWorld(rendererApiName, (exposedConfig as ExposedApi));
    preloadDebug("exposed namespaced api on window", {
      apiName,
      rendererApiName,
    });
  }
}

contextBridge.exposeInMainWorld("__ELECTRON_PRELOAD_PING__", {
  loaded: true,
});
preloadDebug("preload loaded");

const port = process.argv.find((arg: string) => arg.startsWith("--port="))?.split("=")[1];
contextBridge.exposeInMainWorld("APP_PORT", port ? parseInt(port, 10) : 0);
preloadDebug("exposed app port", {
  port: port ? parseInt(port, 10) : 0,
});

try{
    const registerApis = registerApi();
    const apiNames = registerApis.map((ApiClass) => {
      const instance = new ApiClass();
      const namespace = instance.getNamespace();
      const apiName = instance.getApiName();
      return namespace ? `${namespace}_${apiName}` : apiName;
    });
    preloadDebug("resolved register apis", {
      count: registerApis.length,
      apis: apiNames,
    });
    contextBridge.exposeInMainWorld("__ELECTRON_BRIDGE__", {
      ready: true,
      apis: apiNames,
    });
    preloadDebug("exposed bridge meta", {
      ready: true,
      apis: apiNames,
    });
    registerApis.forEach(cls => {
      registerRenderApi(cls);
    });
    preloadDebug("completed preload api registration", {
      count: registerApis.length,
    });
}catch(e){
  const message = e instanceof Error ? e.message : String(e);
  contextBridge.exposeInMainWorld("__ELECTRON_BRIDGE_ERROR__", {
    message,
  });
  preloadDebug("preload registration failed", {
    message,
  });
  console.error(e)
}
