import { AxiosRequestConfig } from 'axios';
import { Store } from 'vuex';
import type { RouteComponent, Router, RouteLocationNormalized } from 'vue-router';
import type { RenderContext, RenderError, RenderContextExtra } from './hooks/';
declare type ViseRenderBundle = {
    render: SsrBundleRender;
};
declare type Primitive = bigint | boolean | null | number | string | symbol | undefined;
declare type PlainObject = Record<string, Primitive>;
declare type JSONValue = Primitive | JSONObject | JSONArray;
declare type JSONArray = Array<JSONValue>;
declare type JSONObject = {
    [key: string]: JSONValue;
};
declare type HashMap = {
    [key: string]: JSONValue;
};
declare type FetchSuccess<T> = (store: Store<T>) => void;
declare type FetchFail = Error;
declare type FetchResult<T> = Promise<FetchSuccess<T> | FetchFail>;
declare type ViseRouteComponent<T> = RouteComponent & {
    setup: (...args: any[]) => any;
    fetch: ({ to, headers }: {
        to: RouteLocationNormalized;
        headers: HttpHeaders;
    }) => FetchResult<T>;
};
declare type HttpHeaders = Record<string, string | string[] | undefined>;
declare type SsrBundleSuccessKey = 'app' | 'html' | 'template' | 'preloadLinks';
declare type SsrBundleSuccess = Record<SsrBundleSuccessKey, string> & Record<'extra', RenderContextExtra>;
declare type SsrBundleResult = SsrBundleSuccess | RenderError;
declare type SsrBundleRender = (renderContext: RenderContext) => Promise<SsrBundleResult>;
declare type SsrFetchConfig = AxiosRequestConfig & {
    url?: string;
    path?: string;
    cookies?: {
        [key: string]: string;
    };
};
declare type SsrFetchResultOf<T> = {
    code: number;
    msg: string;
    data: T;
    raw?: JSONObject;
};
declare type SsrFetchResult = SsrFetchResultOf<JSONValue>;
export declare interface ViseRouter extends Router {
    $ssrContext?: {
        headers: HttpHeaders;
    };
}
export type { PlainObject, JSONValue, JSONArray, JSONObject, HashMap, FetchSuccess, FetchFail, FetchResult, ViseRouteComponent, HttpHeaders, RenderContextExtra, SsrBundleSuccess, SsrBundleResult, SsrBundleSuccessKey, SsrBundleRender, SsrFetchConfig, SsrFetchResultOf, SsrFetchResult, ViseRenderBundle, };
export { httpFetcher } from './node/utils/http-fetcher';
export { fillSsrTemplate, refillRenderResult } from './node/utils/strings';
export { default as mergeConfig } from './node/utils/merge-config';
export { default as isEqual } from './node/utils/is-equal';
export { cloneDeep } from './node/utils/object';
export { getAppVisePath } from './node/utils/path';
export { default as matchAppForUrl } from './node/utils/match-app';
export type { ViseConfig, SsrCacheKeyGenerator, EHtmlFixedPositions, } from './node/app-config';
export { HTTPRequest, HTTPResponse, ResolvedRequest, CacheInfo, HitCache, RenderContext, RenderResult, RenderError, HookCallback, HookRouterBase, HookCallbackConfig, VisePlugin, ViseHooks, HookNames, RenderResultCategory, ALL_HOOKS, HookCaller, HookLifeCycle, HookManager, HookLogger, } from './hooks/';
