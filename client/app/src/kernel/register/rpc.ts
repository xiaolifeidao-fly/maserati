import { ElectronApi, Protocols } from "@eleapi/base";
import { registerApiImpl } from "@src/impl/register";
import { ipcMain } from "electron";
import log from "electron-log";
import { mainWindow } from "../windows";

 function registerMethodsFromClass(cls: { new(...args: any[]): ElectronApi }) {
    const prototype = cls.prototype; // 通过类获取原型
  
    Object.getOwnPropertyNames(prototype)
        .filter((key) => key !== 'constructor')
        .forEach(async (methodName) => {
            const method = (prototype as any)[methodName]; // 获取实例方法
            // 使用单例实例调用方法
            const registerInstance = new cls();
            const metadata = Reflect.getMetadata('invokeType', prototype, methodName);
            if(metadata == Protocols.INVOKE){
                const namespace = registerInstance.getNamespace();
                const apiName = registerInstance.getApiName();
                let rendererApiName = apiName;
                if(namespace){
                    rendererApiName = namespace + "_" + apiName;
                }
                log.info("metadata impl", metadata, `${rendererApiName}.${methodName}`);
                ipcMain.handle(`${rendererApiName}.${methodName}`, async (event, ...args) => {
                    const instance = new cls();
                    
                    // 获取调用源的端口信息
                    const webContents = event.sender;
                    const port = (webContents as any).port || 0;
                    const windowId = (webContents as any).windowId || 'main';
                    
                    // 设置端口上下文
                    instance.setPort(port);
                    instance.setWindowId(windowId);
                    
                    // 设置对应的窗口
                    if (port && port !== 0) {
                        instance.setWindows(mainWindow);
                    } else {
                        instance.setWindows(mainWindow);
                    }
                    
                    return method.apply(instance, args);
                });
            }
        });
}




export async function registerRpc(){
    const register = registerApiImpl();
    register.forEach(cls => {
        registerMethodsFromClass(cls);
    });
}


