import type { HTTPRequest, HTTPResponse, RenderContextExtra, ViseHooks } from './hook-manager';
import HookLogger from './hook-logger';
declare class HookLifeCycle {
    private hookCaller;
    constructor(viseHooks: ViseHooks, logger?: HookLogger);
    start(httpRequest: HTTPRequest, sessionExtra?: Partial<RenderContextExtra>): Promise<HTTPResponse>;
    private callCacheHooks;
    private callRenderHooks;
    private end;
}
export default HookLifeCycle;
