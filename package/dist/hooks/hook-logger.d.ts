import type { JSONValue } from '../';
import type { HookNames } from './hook-manager';
declare type HookLogProcessor = (interception: JSONValue, fullLog?: boolean) => string;
export default class HookLogger {
    static mapHookLogProcessor: Partial<Record<HookNames, HookLogProcessor>>;
    private doLog;
    private fullLog;
    constructor(doLog?: (txt: string) => void, fullLog?: boolean);
    log(hookName: HookNames, interception: JSONValue): void;
}
export {};
