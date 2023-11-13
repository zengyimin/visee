import Axios from 'axios';
import 'fs';
import serialize from 'serialize-javascript';
import path, { dirname } from 'path';
import 'zx';
import { fileURLToPath } from 'url';
import tapable from 'tapable';

/**
 * 判断是否纯对象
 *
 * @export
 * @param {*} obj
 * @return {*}  {boolean}
 */
function isPureObject(obj) {
    return Object.prototype.toString.call(obj) === '[object Object]';
}
/**
 * 删除无效的 key
 *
 * @export
 * @param {HashMap} obj
 * @return {*}  {HashMap}
 */
function deleteInvalidKey(obj) {
    if (!isPureObject(obj))
        return obj;
    const newObj = {};
    const keys = Object.keys(obj);
    keys.forEach((key) => {
        const val = obj[key];
        if (val === undefined || val === null)
            return;
        newObj[key] = val;
    });
    return newObj;
}
const cloneDeep = (function () {
    let seen = [];
    function cloneDeepInner(source) {
        if (source === null || typeof source !== 'object') {
            // Primitive value: bigint, boolean, null, number, string, symbol, undefined
            return source;
        }
        if (Array.isArray(source)) {
            return source.map(cloneDeep);
        }
        // 到这里只能是 JSONObject 了
        // fix infinite loop caused by circular reference
        const alreadyCloned = seen.find(v => v[0] === source)?.[1];
        if (alreadyCloned) {
            return alreadyCloned;
        }
        const cloned = {};
        seen.push([source, cloned]);
        return Object.keys(source).reduce((previousValue, key) => {
            // 这里就是刻意要改变入参对象
            // @ts-ignore
            // eslint-disable-next-line no-param-reassign
            previousValue[key] = cloneDeep(source[key]);
            return previousValue;
        }, cloned);
    }
    return function (source) {
        seen = [];
        return cloneDeepInner(source);
    };
}());

/*
 * @Description  : axios 请求库
 * @usage        :
 * @Date         : 2021-09-28 17:13:13
 * @Author       : hadeshe<hadeshe@tencent.com>
 * @LastEditors: Please set LastEditors
 * @LastEditTime: 2021-09-30 15:55:44
 * @FilePath     : /vise/packages/core/src/node/utils/axios.ts
 */
// 创建请求器实例
const axios = Axios.create({
    timeout: 5000,
});
// 设置 axios 的请求拦截器
const setAxiosRequestInterceptor = () => {
    axios.interceptors.request.use((config) => {
        const { params: oriParams = {} } = config;
        const params = deleteInvalidKey(oriParams);
        return {
            ...config,
            params,
        };
    }, error => Promise.reject(error));
};
// 设置 axios 的响应拦截器
const setAxiosResponseInterceptor = () => {
    axios.interceptors.response.use(res => res.data, error => Promise.reject(error));
};
// 执行注入请求、响应拦截器
setAxiosRequestInterceptor();
setAxiosResponseInterceptor();

async function httpFetcher(config) {
    if (config.url) {
        const res = await axios.request(config);
        const code = parseInt(String(res.code), 10);
        return {
            code: isNaN(code) ? 500 : code,
            msg: res.msg ?? 'ok',
            data: res.data ?? res,
        };
    }
    return {
        code: 500,
        msg: 'No url provided in config.',
        data: '',
    };
}

function isObject(value) {
    return Object.prototype.toString.call(value) === '[object Object]';
}
function mergeConfig(defaults, ...overrides) {
    const merged = { ...defaults };
    overrides.forEach((override) => {
        Object.keys(override).forEach((key) => {
            const value = override[key];
            if (value === undefined) {
                return;
            }
            const existing = merged[key];
            if (existing === null || existing === undefined) {
                merged[key] = value;
                return;
            }
            if (Array.isArray(value)) {
                if (Array.isArray(existing)) {
                    // ts 识别不出来这个转换，是因为 Array.isArray 的 type guard
                    // 给 value 增添了新的类型：arg is any[]，使用 unknown 转换
                    merged[key] = [...existing, ...value];
                }
                return;
            }
            if (isObject(existing)) {
                if (isObject(value)) {
                    merged[key] = mergeConfig(existing, 
                    // 此处有个看起来比较愚蠢的不能识别的 Partial 类型匹配…
                    // Argument of type 'DeepPartial<T>[keyof T]' is not
                    // assignable to parameter of type 'DeepPartial<T[keyof T]>'
                    value);
                }
                return;
            }
            if (typeof value === typeof existing) {
                merged[key] = value;
            }
        });
    });
    return merged;
}

function toKebab(camelString) {
    return camelString.replace(/([A-Z])/g, match => `-${match.toLowerCase()}`);
}
function replaceContentBetweenMarks({ source, mark, replacement, mode = 'script', }) {
    let startMark = `// <!--START_${mark}`;
    let endMark = `// END_${mark}-->`;
    if (mode === 'html') {
        startMark = `<!--START_${mark}-->`;
        endMark = `<!--END_${mark}-->`;
    }
    const startPosition = source.indexOf(startMark);
    const endPosition = source.indexOf(endMark);
    // 如果 replacement 参数为 true，则使用当前 Marks 之间的内容替换(去除对外输出中的 marks)
    const realReplacement = replacement === true
        ? source.substring(startPosition + startMark.length, endPosition)
        : replacement;
    return [
        source.substring(0, startPosition),
        realReplacement,
        source.substring(endPosition + endMark.length),
    ].join('');
}
function replacePlaceholderWithValue(source, placeholderKey, replacement) {
    const placeholder = getPlaceholderOf(placeholderKey);
    return source.replace(placeholder, replacement);
}
function getPlaceholderOf(placeholderKey) {
    return `<!--ssr-${toKebab(placeholderKey)}-->`;
}
function getInitStateScript(initState) {
    return `<script>try { window.Vise.initState = ${serialize(initState)}; } catch (err) { console.error('[Vise] fail to read initState.'); }</script>`;
}
function fillSsrTemplate(ssrResult, extra) {
    let html = ssrResult.template;
    // 使用 vue 中通过 useSSRContext 传出的变量控制页面，可以通过 RenderContext.extra 取回
    // 目前暂时只处理 title 和 initState
    if (extra.title) {
        // true 的含义是把 marks 换掉，避免输出内容出现不明注释
        const replacement = extra.title
            ? `<title>${String(extra.title)}</title>`
            : true;
        // <title> 已经使用 vise config 中的配置在 html 模板中替换了一次，
        // 但依旧带着 mark 注释，为了这里使用动态数据再次替换
        html = replaceContentBetweenMarks({
            source: html,
            mark: 'TITLE',
            replacement,
            mode: 'html',
        });
    }
    html = replacePlaceholderWithValue(html, 'initState', getInitStateScript(extra.initState || {}));
    return Object.keys(ssrResult)
        .reduce((lastValue, key) => {
        const value = ssrResult[key] ?? '';
        return replacePlaceholderWithValue(lastValue, key, value);
    }, html);
}
function refillRenderResult(renderResult) {
    return mergeConfig(renderResult, {
        ssrResult: {
            html: fillSsrTemplate(renderResult.ssrResult, renderResult.context.extra),
        },
    });
}

function isEqualArray(itemA, itemB) {
    if (!(itemB instanceof Array) || itemA.length !== itemB.length) {
        return false;
    }
    return itemA
        .findIndex((value, index) => !isEqual(itemB[index], value)) === -1;
}
function isEqualObject(objA, objB) {
    // 任一为 null 但另外一个 不是 null
    if (objA === null || objB === null) {
        return false;
    }
    if (objA instanceof Array) {
        return isEqualArray(objA, objB);
    }
    if (objB instanceof Array) {
        return false;
    }
    return isEqualPlainObject(objA, objB);
}
function isEqualPlainObject(objA, objB) {
    if (typeof objB !== 'object') {
        return false;
    }
    if (Object.keys(objA).length !== Object.keys(objB).length) {
        return false;
    }
    return Object
        .keys(objA)
        .findIndex((key) => !(key in objB)
        || !isEqual(objA[key], objB[key])) === -1;
}
function isEqual(itemA, itemB) {
    // 7 possible type: object, boolean, number, string, bigint, symbol, and undefined
    // no function type in JSONValue
    if (itemA === itemB) {
        return true;
    }
    if (typeof itemA !== typeof itemB) {
        return false;
    }
    // 以上排除了类型不相等 和 value 相等的情况
    // 以下只存在类型相等且 value 不相等的情况
    // boolean, number, string, bigint, undefined 不存在这种场景
    // symbol 也应该只支持直接比较（如果使用者刻意想比较 key，那么应该用 Symbol.for ）
    // 可能的 type 只有 object, 有 null, array 和 plain object 需要处理
    return isEqualObject(itemA, itemB);
}

dirname(fileURLToPath(import.meta.url));

// 获取 app 根路径，即当前 process 启动路径，vise 命令需要在 app 根目录执行
function getAppRoot() {
    return process.env.PWD;
}
// 获取当前 app 的 vise 缓存目录，位于 app/node_modules/.vise
function getAppVisePath({ root = getAppRoot(), isUrlPath = false, } = {}) {
    const rootDirName = '.vise';
    return isUrlPath
        ? path.join('/node_modules', rootDirName)
        : path.join(root, 'node_modules', rootDirName);
}

function matchAppForUrl(routerBaseConfigs, url) {
    let routerBase = '/';
    const projectName = Object.keys(routerBaseConfigs).find((appName) => {
        const appRouterBase = routerBaseConfigs[appName];
        // 当config配置文件中的 routerBase 为字符串时, 直接看是否能匹配
        if (typeof appRouterBase === 'string' && url.indexOf(appRouterBase) !== -1) {
            routerBase = appRouterBase;
            return true;
        }
        if (typeof appRouterBase !== 'string') {
            // 当配置的 routerBase 为 RegExp[], 在动态替换时 调用了 RegExp.prototype.toString(), 因此要首先转换为 RegExp
            return appRouterBase.some((regStr) => {
                let str = regStr;
                if (str.startsWith('/')) {
                    str = str.substr(1);
                }
                if (str.endsWith('/')) {
                    str = str.substr(0, str.length - 1);
                }
                const regRule = new RegExp(str);
                const [regRes] = url.match(regRule) ?? [];
                if (regRes) {
                    routerBase = regRes;
                    return true;
                }
                return false;
            });
        }
        return false;
    }) ?? '';
    return {
        projectName,
        routerBase,
    };
}

const ALL_HOOKS = [
    'receiveRequest',
    'requestResolved',
    'beforeUseCache',
    'findCache',
    'hitCache',
    'beforeRender',
    'render',
    'afterRender',
    'beforeResponse',
];
const HOOK_TO_INNER = {
    receiveRequest: 'receiveRequestInner',
    findCache: 'findCacheInner',
};
const RenderResultCategory = {
    render: 'render',
    error: 'error',
    receiveRequest: 'receiveRequest',
    hitCache: 'hitCache',
};
class HookManager {
    // 这里用了特殊的 getter 实现，ts 检查不支持
    // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
    hooks = {};
    tap(config) {
        Object.keys(config)
            .forEach((hookName) => {
            const callback = config[hookName];
            if (!callback) {
                return;
            }
            callback.forEach((cb) => {
                // tapPromise 的第一个参数是 tapable 的 pluginName，跟 Vise 的 plugin 不是一回事
                // tapable 的 interception 设计有些无用，所以并不打算依赖其中的数据，直接写死了
                // ts 会匹配不上 cb 类型，因为 ts 把所有 hooks type 聚合了，但因为有 HooksConfig 约束入参
                // 实际 callback 类型跟 hooks 是一一对应的，这里不用检查了，否则只能遍历每个类型
                this[hookName].tapPromise('vise', cb);
            });
        });
    }
    createIfEmpty(name, creator) {
        if (!this.hooks[name]) {
            this.hooks[name] = creator();
        }
        return this.hooks[name];
    }
    // 接收到 HTTP 请求后，可以在此拦截请求，可以简单生成 RenderType 为 receiveRequest 的 RenderResult
    // 在 afterRender 钩子中进一步处理具体渲染结果，相关信息放入 renderResult.context.extra
    // 任意回调函数(tapped function)返回结果即终止其它回调函数执行
    get receiveRequest() {
        return this.createIfEmpty('receiveRequest', () => new tapable.AsyncParallelBailHook(['request']));
    }
    // hook-life-cycle 内部实际使用的 receiveRequest hooks，回调是封装后的 HOF
    get receiveRequestInner() {
        return this.createIfEmpty('receiveRequestInner', () => new tapable.AsyncParallelBailHook(['request']));
    }
    // HTTP 请求解析完成，多个钩子函数顺序执行传递解析结果，可在此修改解析结果
    // 注意如果修改了 url，会导致 hydration 时候出现 mismatch：js 端看到的是修改前的 urlA
    // 服务端看到的是修改后的 urlB，所以如果这里修改 url，需要配合前端的逻辑同步修改
    get requestResolved() {
        return this.createIfEmpty('requestResolved', () => new tapable.AsyncSeriesWaterfallHook(['resolvedRequest']));
    }
    // 在开始使用 HTML 缓存之前执行
    // 多个钩子并行执行，串行依赖自行在单个钩子中解决。返回钩子返回结果即终止其它钩子执行。
    // 返回值 CacheInfo 包含 cache key、cache 有效期信息；
    // 服务端会使用其中信息试图命中缓存，如果未命中，重新生成的 HTMl 会依赖此缓存信息进行缓存
    get beforeUseCache() {
        return this.createIfEmpty('beforeUseCache', () => new tapable.AsyncParallelBailHook(['renderContext']));
    }
    // 接受 CacheInfo 参数，返回命中的缓存字符串
    // 这个钩子主要是给 server 实现者注入 Redis 查询逻辑等使用，并行执行，第一个返回的结果即为命中的缓存
    // 除非特殊情况 app 业务实现方应该忽略此 hook，否则可能使服务端缓存失效
    get findCache() {
        return this.createIfEmpty('findCache', () => new tapable.AsyncParallelBailHook(['cacheInfo']));
    }
    // hook-life-cycle 内部实际使用的 findCache hooks，回调是封装后的 HOF
    get findCacheInner() {
        return this.createIfEmpty('findCacheInner', () => new tapable.AsyncParallelBailHook(['cacheInfo']));
    }
    // 在 HTML 缓存命中后并行执行所有钩子，然后响应 HTTP 请求，无法在此更改响应，可做统计等
    get hitCache() {
        // AsyncParallelHook 只有一个泛型参数，跟其他 hooks 不同，不能使用 createIfEmpty
        const name = 'hitCache';
        if (!this.hooks[name]) {
            this.hooks[name] = new tapable.AsyncParallelHook(['hitCache']);
        }
        return this.hooks[name];
    }
    // 在准备使用 Vue render bundle 等服务端渲染包生成 HTML 之前调用
    // 可用来请求依赖数据等，多个钩子顺序执行传递请求参数
    get beforeRender() {
        return this.createIfEmpty('beforeRender', () => new tapable.AsyncSeriesWaterfallHook(['renderContext']));
    }
    // 渲染服务端 app 时调用，对于 vue 应用，此步骤对应加载 vue-render-bundle 渲染页面
    // 这个钩子主要是给 server 实现者使用，串行执行，第一个返回的结果即为渲染结果
    // 渲染结果 RenderResult 支持多种类型，包括渲染失败等情况
    // 除非特殊情况 app 业务实现方应该忽略此 hook
    get render() {
        return this.createIfEmpty('render', () => new tapable.AsyncParallelBailHook(['renderContext']));
    }
    // 在 App 渲染完成后执行，根据渲染成功或失败，RenderResult 可能为成功或失败
    // 如需重载渲染结果，钩子可以返回更改后的 RenderResult
    // 渲染结果中包含 SsrBundleSuccess，服务端会使用 SsrBundleSuccess 中的值重新拼装页面模板
    // 这里可以简单替换掉页面 template 而不引起 hydration mismatch (模板是 Vue app 以外的部分)
    // 注意钩子瀑布流顺序执行
    get afterRender() {
        return this.createIfEmpty('afterRender', () => new tapable.AsyncSeriesWaterfallHook(['renderResult']));
    }
    // 在所有 HTTP 响应发送前执行，任意回调函数(tapped function)返回结果即终止其它回调函数执行
    // 任意回调优先返回 HTTPResponse 将替代原有 HTTPResponse 返回
    // RenderResult 包含 RenderContext 中各钩子添加的 meta data 和渲染异常 Error 等信息，可通过它们构建最终响应 HTTPResponse
    get beforeResponse() {
        return this.createIfEmpty('beforeResponse', () => new tapable.AsyncParallelBailHook(['renderResult']));
    }
}

class HookCaller {
    hooks;
    logger;
    constructor(hooks, logger) {
        this.hooks = hooks;
        this.logger = logger;
    }
    async receiveRequest(httpRequest) {
        // 因为返回值被 hof 改变，实际调用的 hook 是 receiveRequestInner
        const hookResult = await this.hooks.receiveRequestInner.promise(httpRequest);
        if (hookResult !== undefined) {
            // 日志仍然按 receiveRequest 显示
            this.log('receiveRequest', hookResult);
        }
        return hookResult;
    }
    async requestResolved(resolvedRequest) {
        const name = 'requestResolved';
        const finalResolvedRequest = await this.hooks[name].promise(resolvedRequest);
        if (!isEqual(finalResolvedRequest.original, finalResolvedRequest.resolved)) {
            this.log(name, finalResolvedRequest);
        }
        return finalResolvedRequest;
    }
    async beforeUseCache(renderContext) {
        const name = 'beforeUseCache';
        const cacheInfo = await this.hooks[name].promise(renderContext);
        if (cacheInfo !== undefined) {
            this.log(name, cacheInfo);
        }
        return cacheInfo;
    }
    async findCache(cacheInfo) {
        // 因为返回值被 hof 改变，实际调用的 hook 是 findCacheInner
        const result = await this.hooks.findCacheInner.promise(cacheInfo);
        if (result !== undefined) {
            // 日志仍然按 findCache 显示
            this.log('findCache', result);
        }
        return result;
    }
    async hitCache(hitCache) {
        const name = 'hitCache';
        this.hooks[name].promise(hitCache);
        this.log(name, hitCache);
    }
    async beforeRender(renderContext) {
        const name = 'beforeRender';
        const finalRenderContext = await this.hooks[name].promise(renderContext);
        if (!isEqual(finalRenderContext, renderContext)) {
            this.log(name, finalRenderContext);
        }
        return finalRenderContext;
    }
    async render(renderContext) {
        const name = 'render';
        const renderResult = await this.hooks[name].promise(renderContext);
        this.log(name, renderResult);
        return renderResult;
    }
    async afterRender(renderResult) {
        const name = 'afterRender';
        const hookResult = await this.hooks[name].promise(renderResult);
        if (!isEqual(hookResult, renderResult)) {
            this.log(name, hookResult);
        }
        return hookResult;
    }
    async beforeResponse(renderResult) {
        const name = 'beforeResponse';
        const hookResult = await this.hooks[name].promise(renderResult);
        if (hookResult !== undefined) {
            this.log(name, hookResult);
        }
        return hookResult;
    }
    log(hookName, interception) {
        this.logger?.log(hookName, interception);
    }
}

const LEGAL_PLUGIN_NAME = /^(vise-plugin-|app-|vise:)[a-z]([a-z0-9-]*[a-z0-9])?$/;
// 封装用户输入的函数，创建高阶函数以便统一处理
// 这个函数的圈复杂度很高，但没关系，逻辑其实是分散在各个不相干的 switch 简单子语句里面的，不会混淆
function getHighOrderFunction(pluginName, hookName, callback) {
    switch (hookName) {
        case 'receiveRequest':
        case 'render':
            return async function (...args) {
                // 2个 hooks 的返回值是一致的
                const renderResult = (await callback(...args));
                if (renderResult) {
                    // 强制固定 renderBy，以便追查渲染来源
                    renderResult.renderBy = pluginName;
                }
                return renderResult;
            };
        case 'afterRender':
            return async function (renderResult) {
                const finalRenderResult = await callback({ ...renderResult });
                if (!isEqual(renderResult, finalRenderResult)) {
                    // 强制固定 renderBy，以便追查渲染来源
                    finalRenderResult.renderBy = pluginName;
                }
                return finalRenderResult;
            };
        case 'requestResolved':
            // 确保用户不会修改 ResolveRequest.original 内容
            return async function (resolvedRequest) {
                const cbWithType = callback;
                const original = cloneDeep(resolvedRequest.original);
                const { resolved } = await cbWithType(resolvedRequest);
                return {
                    original,
                    resolved,
                };
            };
        case 'findCache':
            // 这里只是简单的传递参数，不关心具体类型
            return async function (cacheInfo) {
                const content = await callback(cacheInfo);
                if (content) {
                    return {
                        content,
                        renderBy: pluginName,
                    };
                }
            };
    }
    return callback;
}
function mergeCallbacksOfOneHook(pluginName, hookName, oldCallbacks, configsOfOneHook) {
    // 标准化 hooks 为数组模式
    const configs = Array.isArray(configsOfOneHook) ? configsOfOneHook : [configsOfOneHook];
    return configs
        // 标准化 config
        .map(conf => ('callback' in conf ? conf : {
        callback: conf,
    }))
        .reduce((callbackAry, conf) => [...callbackAry, {
            ...conf,
            callback: getHighOrderFunction(pluginName, hookName, conf.callback),
        }], oldCallbacks ?? []);
}
function wrapAppAsPlugin(viseHooks) {
    const appHooks = ALL_HOOKS
        .reduce((prev, hookName) => (viseHooks[hookName] ? {
        ...prev,
        [hookName]: viseHooks[hookName],
    } : prev), {});
    return [
        ...viseHooks.plugins ?? [],
        {
            name: `app-${viseHooks.appName}`,
            hooks: appHooks,
        },
    ];
}
const filterAndStandardize = (callbacks, filterType) => callbacks
    .filter(item => item.enforce === filterType)
    .map(item => item.callback);
function getOrderedStdHookConfig(mergedConfig) {
    return Object.keys(mergedConfig)
        .reduce((prev, hookName) => ({
        ...prev,
        [hookName]: [
            // 用 filter 而不用 sort，避免改变同一 enforce 下的顺序
            ...filterAndStandardize(mergedConfig[hookName], 'pre'),
            ...filterAndStandardize(mergedConfig[hookName], undefined),
            ...filterAndStandardize(mergedConfig[hookName], 'post'),
        ],
    }), {});
}
function mergePluginConfigs(plugins) {
    return plugins.reduce((hookConfig, plugin) => {
        const { name: pluginName, hooks } = plugin;
        return Object.keys(hooks).reduce((hookConfigAfterPartialMerge, hookName) => {
            const rawConf = hooks[hookName];
            if (!rawConf) {
                return hookConfigAfterPartialMerge;
            }
            const newCallbacks = mergeCallbacksOfOneHook(pluginName, hookName, 
            // @ts-ignore hookConfigAfterPartialMerge 是从头新建的
            // 可以确保 hookConfigAfterPartialMerge[hookName] 是数组 | undefined
            hookConfigAfterPartialMerge[hookName], rawConf);
            // 部分 hooks 因为返回值封装 hof 后改变，改用 inner hook
            const outputHookName = Object.prototype.hasOwnProperty.call(HOOK_TO_INNER, hookName)
                ? HOOK_TO_INNER[hookName]
                : hookName;
            return {
                ...hookConfigAfterPartialMerge,
                [outputHookName]: newCallbacks,
            };
        }, hookConfig);
    }, {});
}
function parseHooksWithPlugins(viseHooks) {
    const plugins = wrapAppAsPlugin(viseHooks);
    plugins.forEach(({ name }) => {
        if (!name.match(LEGAL_PLUGIN_NAME)) {
            throw `illegal vise plugin name: ${name}`;
        }
    });
    // 逐个处理 plugin，生成合并 hookConfig
    const mergedConfig = mergePluginConfigs(plugins);
    const orderedConfig = getOrderedStdHookConfig(mergedConfig);
    return orderedConfig;
}

const DEFAULT_RENDER = 'vise:core';
const HTTP_RESPONSE_CODE = {
    success: 200,
    serverError: 500,
};
class HookLifeCycle {
    hookCaller;
    constructor(viseHooks, logger) {
        const hooksConfig = parseHooksWithPlugins(viseHooks);
        const hookManager = new HookManager();
        hookManager.tap(hooksConfig);
        this.hookCaller = new HookCaller(hookManager, logger);
    }
    async start(httpRequest, sessionExtra = {}) {
        const defaultExtra = {
            title: '',
            noCache: false,
            initState: {},
            routerBase: '/',
            ...sessionExtra,
        };
        const { routerBase } = defaultExtra;
        const { url } = httpRequest;
        let path = url.substring(url.indexOf(routerBase) + routerBase.length); // path: 去除前半截的 routerBase 后剩余的部分
        // 统一以 / 开头
        if (!path.startsWith('/')) {
            path = `/${path}`;
        }
        const httpRequestPro = {
            ...httpRequest,
            url: path,
        };
        const defaultContext = {
            request: httpRequestPro,
            extra: defaultExtra,
        };
        const interceptedResult = await this.hookCaller.receiveRequest(httpRequestPro);
        if (interceptedResult !== undefined) {
            return this.end({
                type: 'receiveRequest',
                context: interceptedResult.context,
                renderBy: interceptedResult.renderBy,
            });
        }
        const { resolved: resolvedContext } = await this.hookCaller.requestResolved({
            original: defaultContext,
            resolved: { request: { ...httpRequestPro }, extra: { ...defaultExtra } },
        });
        const cacheResult = await this.callCacheHooks(resolvedContext);
        if ('content' in cacheResult) {
            return this.end({
                ...cacheResult,
                context: resolvedContext,
                type: 'hitCache',
            });
        }
        const finalRenderContext = await this.hookCaller.beforeRender(resolvedContext);
        const finalRenderResult = await this.callRenderHooks(finalRenderContext, cacheResult.cacheInfo);
        return this.end(finalRenderResult);
    }
    async callCacheHooks(context) {
        const cacheInfo = await this.hookCaller.beforeUseCache(context);
        if (cacheInfo?.key) {
            const cacheResult = await this.hookCaller.findCache(cacheInfo);
            if (cacheResult) {
                const hitCache = {
                    ...cacheInfo,
                    content: cacheResult.content,
                };
                this.hookCaller.hitCache(hitCache);
                return {
                    cacheInfo,
                    ...cacheResult,
                };
            }
            return {
                cacheInfo,
            };
        }
        return {};
    }
    async callRenderHooks(context, cacheInfo) {
        let renderResult;
        const { error } = context;
        const getErr = (error) => ({
            type: 'error',
            renderBy: DEFAULT_RENDER,
            context,
            error,
        });
        // 当 RenderContext.error 存在异常时，此时没必要走 render
        // 可以直接吐出 renderError，最后兜底进行降级处理
        if (error) {
            return getErr(error);
        }
        try {
            renderResult = await this.hookCaller.render(context);
        }
        catch (e) {
            renderResult = getErr({
                code: HTTP_RESPONSE_CODE.serverError,
                message: e instanceof Error ? e.message : String(e),
                detail: e instanceof Error ? { stack: e.stack } : undefined,
            });
        }
        if (cacheInfo && renderResult.type === 'render') {
            renderResult.cacheInfo = cacheInfo;
        }
        return renderResult;
    }
    async end(renderResult) {
        const finalRenderResult = await this.hookCaller.afterRender(renderResult);
        const hookRes = await this.hookCaller.beforeResponse(finalRenderResult);
        if (hookRes) {
            return hookRes;
        }
        let code = HTTP_RESPONSE_CODE.success;
        let body;
        switch (renderResult.type) {
            case 'hitCache':
                body = renderResult.content;
                break;
            case 'error':
                code = renderResult.error.code;
                body = renderResult.error.message;
                break;
            case 'receiveRequest':
                // should not end here, plugin intercept at receiveRequest should finish render
                // in previous hooks
                code = HTTP_RESPONSE_CODE.serverError;
                body = 'Fatal Error: Hooks intercept the request with receiveRequest without finish rendering';
                break;
            default: // render
                body = renderResult.ssrResult.html;
        }
        return {
            code,
            body,
            headers: {
                'content-type': 'text/html; charset=utf-8',
            },
        };
    }
}

class HookLogger {
    static mapHookLogProcessor = {
        receiveRequest(interception, fullLog) {
            const data = interception;
            return JSON.stringify(fullLog ? data : {
                renderBy: data.renderBy, extra: data.context.extra,
            });
        },
        requestResolved(interception, fullLog) {
            const { resolved } = interception;
            const { extra } = resolved;
            return JSON.stringify(fullLog ? resolved : {
                ...resolved,
                extra: {
                    ...extra,
                    initState: extra.initState ? JSON.stringify(extra.initState).substring(0, 100) : null,
                },
            });
        },
        findCache(interception, fullLog) {
            const data = interception;
            return JSON.stringify(fullLog ? data : {
                renderBy: data.renderBy,
                content: `${data.content.substring(0, 100)}...`,
            });
        },
        beforeRender(interception, fullLog) {
            const data = interception;
            const { extra } = data;
            return JSON.stringify(fullLog ? data : {
                ...data,
                extra: {
                    ...extra,
                    initState: extra.initState ? JSON.stringify(extra.initState).substring(0, 100) : null,
                },
            });
        },
        render(interception, fullLog) {
            const data = interception;
            let txt;
            if (data.type === 'error') {
                txt = `render failed with: ${JSON.stringify(data.error)}`;
            }
            else if (data.type === 'render') {
                if (fullLog) {
                    return JSON.stringify(data);
                }
                txt = `${data.ssrResult.app.substring(0, 100)}...`;
            }
            return JSON.stringify({
                renderBy: data.renderBy,
                result: txt,
            });
        },
        afterRender(interception, fullLog) {
            const data = interception;
            if (fullLog) {
                return JSON.stringify(data);
            }
            const { request, extra } = data.context;
            const tmp = {
                renderBy: data.renderBy,
                context: {
                    request: { url: request.url },
                    extra: {
                        ...extra,
                        initState: extra.initState ? JSON.stringify(extra.initState).substring(0, 100) : null,
                    },
                },
            }; // 临时 log 用数据，类型无所谓
            if (data.type === 'error') {
                tmp.error = data.error;
            }
            else {
                tmp.type = data.type;
            }
            return JSON.stringify(tmp);
        },
        beforeResponse(interception, fullLog) {
            const data = interception;
            return data ? JSON.stringify(fullLog ? data : {
                ...data,
                body: data.body ? `${data.body.substring(0, 100)}...` : '',
            }) : '';
        },
    };
    doLog;
    fullLog;
    constructor(doLog = console.log, fullLog = false) {
        this.doLog = doLog;
        this.fullLog = fullLog;
    }
    log(hookName, interception) {
        if (hookName === 'hitCache') {
            return;
        }
        const txt = HookLogger.mapHookLogProcessor[hookName]
            ? HookLogger.mapHookLogProcessor[hookName](interception, this.fullLog)
            : JSON.stringify(interception);
        if (txt !== '') {
            this.doLog(`[hook] "${hookName}" intercept with: ${txt}`);
        }
    }
}

export { ALL_HOOKS, HookCaller, HookLifeCycle, HookLogger, HookManager, RenderResultCategory, cloneDeep, fillSsrTemplate, getAppVisePath, httpFetcher, isEqual, matchAppForUrl, mergeConfig, refillRenderResult };
//# sourceMappingURL=index.js.map
