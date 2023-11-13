import type { HookCallbackConfig, StdHookCallbackConfig, ViseHooks } from './hook-manager';
export declare type VisePlugin = {
    name: string;
    hooks: HookCallbackConfig;
};
export declare function parseHooksWithPlugins(viseHooks: ViseHooks): StdHookCallbackConfig;
