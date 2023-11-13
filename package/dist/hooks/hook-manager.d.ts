import tapable from 'tapable';
import type { HttpHeaders, JSONObject, SsrBundleSuccessKey } from '../';
import type { VisePlugin } from './hook-plugin';
export declare const ALL_HOOKS: readonly ["receiveRequest", "requestResolved", "beforeUseCache", "findCache", "hitCache", "beforeRender", "render", "afterRender", "beforeResponse"];
export declare const HOOK_TO_INNER: {
    readonly receiveRequest: "receiveRequestInner";
    readonly findCache: "findCacheInner";
};
export declare type HookNames = typeof ALL_HOOKS[number];
export declare type InnerHookNames = typeof HOOK_TO_INNER[keyof typeof HOOK_TO_INNER];
export declare type HTTPRequest = {
    readonly url: string;
    readonly headers: HttpHeaders;
    readonly body?: string;
};
export declare type HTTPResponse = {
    code: number;
    headers: HttpHeaders;
    body?: string;
};
export declare type RenderContextExtra = JSONObject & {
    title: string;
    noCache: boolean;
    initState: JSONObject;
    routerBase: string;
};
export declare type RenderContext = {
    request: HTTPRequest;
    extra: RenderContextExtra;
    error?: RenderError;
};
export declare type ResolvedRequest = {
    original: RenderContext;
    resolved: RenderContext;
};
export declare type CacheInfo = {
    key: string;
    expire: number;
    stale: boolean;
};
export declare type HitCache = CacheInfo & {
    content: string;
};
export declare type FindCacheResult = {
    content: string;
    renderBy: string;
};
export declare type RenderError = {
    code: number;
    message: string;
    detail?: Record<string, string | number | undefined>;
};
export declare const RenderResultCategory: {
    readonly render: "render";
    readonly error: "error";
    readonly receiveRequest: "receiveRequest";
    readonly hitCache: "hitCache";
};
declare type RenderResultBase = {
    context: RenderContext;
    renderBy: string;
};
export declare type SuccessRenderResult = RenderResultBase & {
    type: 'render';
    ssrResult: Record<SsrBundleSuccessKey, string>;
    cacheInfo?: CacheInfo;
};
export declare type RenderResult = (RenderResultBase & ({
    type: 'error';
    error: RenderError;
} | {
    type: 'receiveRequest';
} | {
    type: 'hitCache';
    content: string;
    cacheInfo: CacheInfo;
})) | SuccessRenderResult;
declare type SecondArgOf<T> = T extends (arg1: any, arg2: infer U, ...args: any[]) => any ? U : never;
export declare type ArrayOrSingle<T> = T | T[];
export declare type HookCallback = {
    [K in HookNames]: SecondArgOf<InstanceType<typeof HookManager>[K]['tapPromise']>;
};
export declare type HookCallbackConfig = {
    [K in HookNames]?: ArrayOrSingle<HookCallback[K] | {
        callback: HookCallback[K];
        enforce?: 'pre' | 'post';
    }>;
};
export declare type StdHookCallbackConfig = {
    [K in HookNames]?: Array<HookCallback[K]>;
};
export declare type HookRouterBase = string | string[];
export declare type ViseHooks = HookCallbackConfig & {
    appName: string;
    routerBaseConfig: HookRouterBase;
    plugins?: Array<VisePlugin>;
};
export default class HookManager {
    private hooks;
    tap(config: StdHookCallbackConfig): void;
    private createIfEmpty;
    get receiveRequest(): tapable.AsyncHook<[HTTPRequest], void | Omit<RenderResult, "type" | "renderBy">, tapable.UnsetAdditionalOptions>;
    get receiveRequestInner(): tapable.AsyncHook<[HTTPRequest], void | RenderResult, tapable.UnsetAdditionalOptions>;
    get requestResolved(): tapable.AsyncHook<[ResolvedRequest], ResolvedRequest, tapable.UnsetAdditionalOptions>;
    get beforeUseCache(): tapable.AsyncHook<[RenderContext], void | CacheInfo, tapable.UnsetAdditionalOptions>;
    get findCache(): tapable.AsyncHook<[CacheInfo], string | void, tapable.UnsetAdditionalOptions>;
    get findCacheInner(): tapable.AsyncHook<[CacheInfo], void | FindCacheResult, tapable.UnsetAdditionalOptions>;
    get hitCache(): tapable.AsyncHook<any, any, tapable.UnsetAdditionalOptions>;
    get beforeRender(): tapable.AsyncHook<[RenderContext], RenderContext, tapable.UnsetAdditionalOptions>;
    get render(): tapable.AsyncHook<[RenderContext], RenderResult, tapable.UnsetAdditionalOptions>;
    get afterRender(): tapable.AsyncHook<[RenderResult], RenderResult, tapable.UnsetAdditionalOptions>;
    get beforeResponse(): tapable.AsyncHook<[RenderResult], void | HTTPResponse, tapable.UnsetAdditionalOptions>;
}
export {};
