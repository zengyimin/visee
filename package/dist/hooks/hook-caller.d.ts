import type { HTTPRequest, RenderContext, RenderResult, ResolvedRequest, HitCache, CacheInfo } from './hook-manager';
import HookManager from './hook-manager';
import HookLogger from './hook-logger';
declare class HookCaller {
    private hooks;
    private logger;
    constructor(hooks: HookManager, logger?: HookLogger);
    receiveRequest(httpRequest: HTTPRequest): Promise<void | RenderResult>;
    requestResolved(resolvedRequest: ResolvedRequest): Promise<ResolvedRequest>;
    beforeUseCache(renderContext: RenderContext): Promise<void | CacheInfo>;
    findCache(cacheInfo: CacheInfo): Promise<void | import("./hook-manager").FindCacheResult>;
    hitCache(hitCache: HitCache): Promise<void>;
    beforeRender(renderContext: RenderContext): Promise<RenderContext>;
    render(renderContext: RenderContext): Promise<RenderResult>;
    afterRender(renderResult: RenderResult): Promise<RenderResult>;
    beforeResponse(renderResult: RenderResult): Promise<void | import("./hook-manager").HTTPResponse>;
    private log;
}
export default HookCaller;
