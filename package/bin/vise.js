#!/usr/bin/env node
import { Command } from 'commander';
import vite, { mergeConfig as mergeConfig$1 } from 'vite';
import path, { dirname } from 'path';
import glob from 'glob';
import { rename, copyFile } from 'fs/promises';
import { $, path as path$1 } from 'zx';
import { fileURLToPath } from 'url';
import fs, { promises } from 'fs';
import vue from '@vitejs/plugin-vue';
import legacy from '@vitejs/plugin-legacy';
import nodeResolve from '@rollup/plugin-node-resolve';
import { visualizer } from 'rollup-plugin-visualizer';
import { minify } from 'html-minifier-terser';
import serialize from 'serialize-javascript';
import { build } from 'esbuild';
import esbuildPluginAlias from 'esbuild-plugin-alias';
import jsdom from 'jsdom';
import chalk from 'chalk';
import enquirer from 'enquirer';
import ora from 'ora';
import express from 'express';
import tapable from 'tapable';

const DIR_NAME = dirname(fileURLToPath(import.meta.url));

// 匹配 a, a-b, 1a-b0-c
const VALID_TEMPLATE_NAME = /^[a-z0-9]+(([a-z0-9]+-)*[a-z0-9]+)?$/;
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
// 获取当前运行的 npm 包中指定类型模板根目录
// 即 node_modules/vise/template/vue3-app 等
function getRuntimeTemplateRoot(templateName) {
    if (templateName.match(VALID_TEMPLATE_NAME)) {
        return path.resolve(DIR_NAME, '../template', templateName);
    }
    throw `Invalid template name ${templateName}`;
}
// 获取当前运行的 npm 包中指定类型模板 base 目录
// vise create 新建项目时使用
function getNewAppTemplatePath(templateName) {
    return path.join(getRuntimeTemplateRoot(templateName), 'base');
}
// 获取当前运行的 npm 包中指定类型模板 runtime 目录
// vise dev, vise build 等命令动态插入使用
function getTemplateRuntimePath(templateName) {
    return path.join(getRuntimeTemplateRoot(templateName), 'runtime');
}
function isInDir(subPath, rootPath = getAppVisePath()) {
    const relativePath = path.relative(rootPath, subPath);
    return !relativePath.startsWith('../');
}
async function ensureDir(dirPath, needEmptyDir) {
    if (!isInDir(dirPath)) {
        throw 'Can NOT operate files outside root';
    }
    $.verbose = false;
    const createdDir = await $ `mkdir -p ${dirPath}`;
    if (needEmptyDir) {
        await $ `rm -rf ${dirPath}/*`;
    }
    return createdDir.exitCode === 0;
}

async function prepareViseDir(visePath) {
    await ensureDir(visePath, true);
}

const VIRTUAL_PREFIX = '\0virtual:';
const APP_VISE_PATH = getAppVisePath({ isUrlPath: true });
const getResolvedWithVirtualConfig = (id, mod) => {
    if (typeof mod === 'string')
        return id;
    return mod.virtual ? `${VIRTUAL_PREFIX}${id}` : id;
};
const isTsFile = (filePath) => path.extname(filePath) === '.ts';
const hasNoFileExtension = (filePath) => path.extname(filePath) === '';
function viseScaffold({ modules }) {
    const resolvedIds = new Map();
    let indexModule;
    Object.keys(modules).forEach((id) => {
        const mod = modules[id];
        if (id.endsWith('index.html')) {
            indexModule = mod;
        }
        resolvedIds.set(path.resolve(id), mod);
    });
    return {
        name: 'vise:scaffold',
        enforce: 'pre',
        resolveId(source, importer) {
            // console.log('resolve', source, importer, modules);
            let sourceID = source;
            if (source.startsWith(APP_VISE_PATH)) { // when import from browser in dev use absolute path
                sourceID = `.${source}`;
            }
            const mod = modules[sourceID];
            if (mod) {
                return getResolvedWithVirtualConfig(sourceID, mod);
            }
            if (importer) {
                const importerRealPath = importer.startsWith(VIRTUAL_PREFIX)
                    ? importer.slice(VIRTUAL_PREFIX.length)
                    : importer;
                let resolved = path.resolve(path.dirname(importerRealPath), sourceID);
                // import ts file from anther ts file without file extension
                if (hasNoFileExtension(resolved) && isTsFile(importerRealPath)) {
                    resolved = `${resolved}.ts`;
                }
                if (resolvedIds.has(resolved))
                    return getResolvedWithVirtualConfig(resolved, resolvedIds.get(resolved));
            }
        },
        // 如果命中配置中的模块，使用配置中的字符串或者方法返回文件内容
        async load(id) {
            const realId = id.startsWith(VIRTUAL_PREFIX) ? id.slice(VIRTUAL_PREFIX.length) : id;
            const mod = realId in modules ? modules[realId] : resolvedIds.get(realId);
            if (mod) {
                const content = typeof mod === 'string' ? mod : mod.content;
                return typeof content === 'string' ? content : await content();
            }
        },
        async transformIndexHtml(html) {
            if (html !== '')
                return html;
            const content = typeof indexModule === 'string' ? indexModule : indexModule.content;
            return typeof content === 'string' ? content : await content();
        },
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

async function dynamicImportTs(filePath) {
    let result = undefined;
    try {
        await promises.access(filePath, fs.constants.F_OK);
        // bundle the config file w/ ts transforms first, write it to disk,
        // load it with native Node ESM, then delete the file.
        const bundled = await bundleTsFile(filePath);
        const tempConfigPath = `${filePath}.js`;
        await promises.writeFile(tempConfigPath, bundled.code);
        result = (await dynamicImport(`${tempConfigPath}?t=${Date.now()}`)).default;
        await promises.unlink(tempConfigPath);
    }
    catch (error) {
        console.error('[dynamicImportTs error]', error);
    }
    return result;
}
async function bundleTsFile(fileName) {
    const result = await build({
        absWorkingDir: process.cwd(),
        entryPoints: [fileName],
        outfile: 'out.js',
        write: false,
        platform: 'node',
        bundle: true,
        format: 'esm',
        sourcemap: 'inline',
        metafile: true,
        plugins: [
            esbuildPluginAlias({
                '@/': `${path.resolve(path.dirname(fileName), 'src')}/`,
            }),
            {
                name: 'externalize-deps',
                setup(build) {
                    build.onResolve({ filter: /.*/ }, (args) => {
                        const id = args.path;
                        if (id[0] !== '.' && !id.startsWith('@/') && !path.isAbsolute(id)) {
                            return {
                                external: true,
                            };
                        }
                    });
                },
            },
            {
                name: 'replace-import-meta',
                setup(build) {
                    build.onLoad({ filter: /\.[jt]s$/ }, async (args) => {
                        const contents = await fs.promises.readFile(args.path, 'utf8');
                        return {
                            loader: args.path.endsWith('.ts') ? 'ts' : 'js',
                            contents: contents
                                .replace(/\bimport\.meta\.url\b/g, JSON.stringify(`file://${args.path}`))
                                .replace(/\bimport\.meta\.env\.SSR\b/g, JSON.stringify(true))
                                .replace(/\bimport\.meta\.env\b/g, JSON.stringify({}))
                                .replace(/\b__dirname\b/g, JSON.stringify(path.dirname(args.path)))
                                .replace(/\b__filename\b/g, JSON.stringify(args.path)),
                        };
                    });
                },
            },
        ],
    });
    const { text } = result.outputFiles[0];
    return {
        code: text,
        // dependencies: result.metafile ? Object.keys(result.metafile.inputs) : [],
    };
}
const usingDynamicImport = typeof jest === 'undefined';
/**
 * Dynamically import files. It will make sure it's not being compiled away by TS/Rollup.
 *
 * As a temporary workaround for Jest's lack of stable ESM support, we fallback to require
 * if we're in a Jest environment.
 * See https://github.com/vitejs/vite/pull/5197#issuecomment-938054077
 *
 * @param file File path to import.
 */
const dynamicImport = usingDynamicImport
    // eslint-disable-next-line no-new-func
    ? new Function('file', 'return import(file)')
    : require;

var EHtmlFixedPositions;
(function (EHtmlFixedPositions) {
    EHtmlFixedPositions["headEnd"] = "headEnd";
})(EHtmlFixedPositions || (EHtmlFixedPositions = {}));
// 默认的 vise 项目配置
const DEFAULT_VISE_CONFIG = {
    devPort: 3000,
    htmlClass: '',
    htmlFixedPositionFragments: [],
    defaultTitle: 'Vise Powered App',
    faviconLink: '/logo.svg',
    hmrPort: 3008,
    useFlexible: false,
    directiveTransforms: {},
    ssr: {},
    base: '/',
    routerSyncPages: [],
    resolve: {},
    build: {},
    plugins: [],
    // generateCacheKey: () => '',
    customTemplate: '',
    strictInitState: true,
    scaffold: 'vue3-app',
    htmlMinify: true,
    routerBase: '/',
};
/**
 * 获取 vise 配置
 *
 * @export
 * @return {*}  {Promise<ViseConfig>}
 */
async function getAppViseConfig() {
    let result;
    const viseConfigPath = `${getAppRoot()}/vise.config.ts`;
    const userConfig = await dynamicImportTs(viseConfigPath);
    if (userConfig !== undefined) {
        result = Object.assign({}, DEFAULT_VISE_CONFIG, userConfig);
    }
    else {
        console.error('[getAppViseConfig error]');
        result = Object.assign({}, DEFAULT_VISE_CONFIG);
    }
    if (!result.base.match(/^(\/|https?:\/\/)/)) {
        throw '[vise.config.js]: base must start with a slash or http';
    }
    return result;
}

/*
 * @Description  : html 后置处理插件
 * @usage        :
 * @Date         : 2022-01-12 12:11:50
 * @Author       : hadeshe<hadeshe@tencent.com>
 * @LastEditors  : hadeshe<hadeshe@tencent.com>
 * @LastEditTime : 2022-01-12 12:13:48
 * @FilePath     : /vise/packages/core/src/node/plugin/vise-html-post.ts
 */
const defaultMinifyOption = {
    minifyCSS: true,
    minifyJS: true,
    collapseBooleanAttributes: true,
    collapseInlineTagWhitespace: true,
    collapseWhitespace: true,
    conservativeCollapse: true,
    decodeEntities: true,
    removeAttributeQuotes: true,
    removeScriptTypeAttributes: true,
    removeStyleLinkTypeAttributes: true,
};
// 入参有效性检查
function isArgumentsLegal(html, fragments) {
    if (!html)
        return '';
    if (fragments.length === 0)
        return html;
}
function insertFragment(html, { position, content }) {
    // 若之前已经插入过，则直接返回
    const insertedComment = `<!--comment-${toKebab(position)}-inserted-->`;
    if (html.indexOf(insertedComment) >= 0) {
        return html;
    }
    const realFragmentContent = (typeof content === 'function' ? content() : content) || '';
    // 否则进行插入，并附带插入完成标识
    if (position === EHtmlFixedPositions.headEnd) {
        // 加入 insertedComment 的原因是为了避免有多次被插入的可能性
        return html.replace(/<\/head>/, `${realFragmentContent}${insertedComment}</head>`);
    }
    return html;
}
function getFixedPositionFragmentInsertedHtml(html, fragments) {
    const illegalReturn = isArgumentsLegal(html, fragments);
    if (illegalReturn !== undefined) {
        return illegalReturn;
    }
    // 迭代要插入到固定位置的用户配置
    return fragments.reduce(insertFragment, html);
}
function isTemplateBundle(bundle) {
    return bundle.type === 'asset' && path.basename(bundle.fileName) === 'index.html';
}
async function minifyHtml(html, option) {
    if (option === false) {
        return html;
    }
    return minify(html, option === true ? defaultMinifyOption : option);
}
function getGenerateBundleCallback(fragments, minifyOption) {
    return async function generateBundle(outputOpts, outBundle) {
        if (!outputOpts)
            return;
        // 在这里注入是为了满足生产环境的构建场景
        await Promise.all(Object.values(outBundle).map(async (bundle) => {
            if (!isTemplateBundle(bundle))
                return;
            const insertedHTML = getFixedPositionFragmentInsertedHtml(bundle.source, fragments);
            // API 如此，需要修改参数
            // eslint-disable-next-line no-param-reassign
            bundle.source = await minifyHtml(insertedHTML, minifyOption);
        }));
    };
}
/**
 * html 后置插件
 *
 * @export
 * @param {HtmlPostConfig} config
 * @return {*}  {Plugin}
 */
function viseHtmlPost(config) {
    const { minifyOption, isProduction = false, htmlFixedPositionFragments = [], } = config || {};
    return {
        name: 'vise:scaffold-post',
        enforce: 'post',
        transformIndexHtml(html) {
            if (isProduction || !html)
                return html;
            // 在这里注入是为了兼容开发环境场景
            return getFixedPositionFragmentInsertedHtml(html, htmlFixedPositionFragments);
        },
        generateBundle: getGenerateBundleCallback(htmlFixedPositionFragments, minifyOption),
    };
}

async function titlePlacehoderInjector(rootElement, { placeholder }) {
    // 删除自带title标签
    const titleDom = rootElement.querySelector('title');
    if (titleDom) {
        titleDom.parentElement?.removeChild(titleDom);
    }
    const titlePlaceholder = rootElement.createComment(placeholder);
    rootElement.head.appendChild(titlePlaceholder);
}
async function htmlClassPropertyPlacehoderInjector(rootElement, { placeholder }) {
    rootElement.documentElement.setAttribute(placeholder, '');
}
async function faviconLinkPropertyPlacehoderInjector(rootElement, { placeholder }) {
    const linkDoms = rootElement.querySelectorAll('link');
    const favIconLink = Array.from(linkDoms).find(link => link.getAttribute('rel') === 'icon');
    // 存在favIconLink， 直接在里面加属性
    if (favIconLink) {
        favIconLink.setAttribute(placeholder, '');
    }
    else {
        const faviconLinkDom = rootElement.createElement('link');
        faviconLinkDom.setAttribute('rel', 'icon');
        faviconLinkDom.setAttribute(placeholder, '');
        rootElement.head.appendChild(faviconLinkDom);
    }
}
async function partialFlexiblePlacehoderInjector(rootElement, { placeholder }) {
    const partialFlexiblePlaceholder = rootElement.createComment(placeholder);
    rootElement.head.appendChild(partialFlexiblePlaceholder);
}
async function preloadLinksPlacehoderInjector(rootElement, { placeholder }) {
    const preloadLinksPlaceholder = rootElement.createComment(placeholder);
    rootElement.head.appendChild(preloadLinksPlaceholder);
}
async function initStatePlacehoderInjector(rootElement, { placeholder }) {
    const initStatePlaceholder = rootElement.createComment(placeholder);
    const appDOM = rootElement.querySelector('#app');
    if (appDOM) {
        appDOM.after(initStatePlaceholder);
    }
    else {
        rootElement.head.appendChild(initStatePlaceholder);
    }
}
async function appPlacehoderInjector(rootElement, { placeholder }) {
    let rootDom = rootElement.querySelector('#app');
    if (rootDom) {
        rootDom.innerHTML = `<!--${placeholder}-->`;
    }
    else {
        rootDom = rootElement.createElement('div');
        rootDom.id = 'app';
        rootDom.innerHTML = `<!--${placeholder}-->`;
        rootElement.body.appendChild(rootDom);
    }
}
async function entryScriptInjector(rootElement) {
    const entryScript = rootElement.createElement('script');
    entryScript.type = 'module';
    entryScript.src = path.join(getAppVisePath({ isUrlPath: true }), 'entry-client.ts');
    rootElement.body.appendChild(entryScript);
}
async function startingViseInjector(rootElement) {
    const startingScript = rootElement.createElement('script');
    const textNode = rootElement.createTextNode('window.Vise = {};');
    startingScript.appendChild(textNode);
    rootElement.head.insertBefore(startingScript, rootElement.head.firstChild);
}
var injectors = [
    {
        injector: htmlClassPropertyPlacehoderInjector,
        placeholder: 'ssr-html-class',
    },
    {
        injector: faviconLinkPropertyPlacehoderInjector,
        placeholder: 'ssr-favicon-link',
    },
    {
        injector: titlePlacehoderInjector,
        placeholder: 'ssr-title',
    },
    {
        injector: partialFlexiblePlacehoderInjector,
        placeholder: 'ssr-partial-flexible',
    },
    {
        injector: preloadLinksPlacehoderInjector,
        placeholder: 'ssr-preload-links',
    },
    {
        injector: initStatePlacehoderInjector,
        placeholder: 'ssr-init-state',
    },
    {
        injector: appPlacehoderInjector,
        placeholder: 'ssr-app',
    },
    {
        injector: entryScriptInjector,
        placeholder: '',
    },
    {
        injector: startingViseInjector,
        placeholder: '',
    },
];

class Logger {
    static info(message) {
        console.log(chalk.white(Logger.formatViseLog(message)));
    }
    static error(message) {
        console.log(chalk.red(Logger.formatViseLog(message)));
    }
    static warn(message) {
        console.log(chalk.yellow(Logger.formatViseLog(message)));
    }
    static success(message) {
        console.log(chalk.green(Logger.formatViseLog(message)));
    }
    static formatViseLog(message) {
        return `[vise]: ${message}`;
    }
    constructor() {
        throw new Error('不需要实例化 Logger');
    }
}

/**
 * 判断文件是否存在
 * @param path 文件路径
 * @returns boolean 存在-true， 不存在-false
 */
async function fileExist(path) {
    try {
        await promises.access(path);
        return true;
    }
    catch {
        return false;
    }
}
async function createJsonFile(src, target, changes) {
    let data;
    try {
        data = JSON.parse(await promises.readFile(src, 'utf-8'));
    }
    catch (e) {
        Logger.error(`读取 ${src} 失败`);
        throw e;
    }
    const newData = { ...data, ...changes, dependencies: { ...data.dependencies, ...changes.dependencies } };
    await promises.writeFile(target, JSON.stringify(newData, null, 2));
}

/**
 * json对象转json字符串
 * @param { Object } json json对象
 */
function stringifyJSONWithRegExp(json) {
    try {
        return JSON.stringify(json, (k, v) => {
            // 将正则对象转换为字面量形式,由斜杠/包围
            if (v instanceof RegExp) {
                return v.toString();
            }
            return v;
        });
    }
    catch (err) {
        throw err;
    }
}

const SCAFFOLD_NAME = 'vue3-app';
const SCAFFOLD_FILES = {
    index: 'index.html',
    partialFlexible: 'partial-flexible.html',
    main: 'main.ts',
    env: 'env.ts',
    router: 'router.ts',
    serverEntry: 'entry-server.ts',
    clientEntry: 'entry-client.ts',
};
const scaffoldContents = {};
async function getScaffoldContent(name) {
    if (!(name in scaffoldContents)) {
        const filePath = path.join(getTemplateRuntimePath(SCAFFOLD_NAME), SCAFFOLD_FILES[name]);
        scaffoldContents[name] = await promises.readFile(filePath, 'utf-8');
    }
    return scaffoldContents[name];
}
// 模板占位符名称枚举
const HTML_PLACEHOLDERS = {
    title: 'title',
    htmlClass: 'html-class',
    faviconLink: 'favicon-link',
    partialFlexible: 'partial-flexible',
};
async function getHooksContents(config) {
    const { routerBase } = config;
    const hooksConfig = await promises.readFile(path.resolve(getAppRoot(), 'src/server-hooks.ts'), 'utf8');
    const regRule = /export[\s]+default[\s]+([\w]+)/;
    const regRes = hooksConfig.match(regRule);
    if (!regRes || !regRes[0] || !regRes[1]) {
        Logger.error('failed dynamic write server-hooks');
        return hooksConfig;
    }
    const [exportStateMent, variableName] = regRes;
    const routerBaseConfig = typeof routerBase === 'string' ? `'${routerBase}'` : stringifyJSONWithRegExp(routerBase);
    return hooksConfig.replace(exportStateMent, `${variableName}.routerBaseConfig = ${routerBaseConfig};\nexport default ${variableName}`);
}
/**
 * 加载自定义html模板
 * @param config 配置项
 */
async function loadCustomTemplateContent(isProduction, config) {
    let { customTemplate } = config;
    if (customTemplate) {
        // 把相对路径处理成绝对路径
        customTemplate = path.isAbsolute(customTemplate)
            ? customTemplate
            : path.resolve(getAppRoot(), customTemplate);
    }
    // 判断自定义的模板文件是否存在
    const customTemplateExist = await fileExist(customTemplate);
    const content = customTemplateExist
        ? await promises.readFile(customTemplate, 'utf8')
        // 如果自定义模板不存在，使用默认模板进行插桩
        : await getScaffoldContent('index');
    const { JSDOM } = jsdom;
    const dom = new JSDOM(content);
    const { window: { document } } = dom;
    injectors.forEach(({ injector, placeholder }) => {
        injector(document, {
            placeholder,
            isProduction,
        });
    });
    const serializeDocument = dom.serialize();
    // dom属性不允许特殊字符命名，手动替换
    const propertyPlaceholderKeys = ['html-class', 'favicon-link'];
    return propertyPlaceholderKeys.reduce((pre, next) => pre.replace(`ssr-${next}=""`, getPlaceholderOf(next)), serializeDocument);
}
async function getIndexHTML(isProduction, config) {
    let template = await loadCustomTemplateContent(isProduction, config);
    // 根据用户配置，注入 html class
    let { htmlClass } = config;
    if (typeof htmlClass === 'function') {
        htmlClass = htmlClass();
    }
    template = replacePlaceholderWithValue(template, HTML_PLACEHOLDERS.htmlClass, htmlClass ? ` class="${htmlClass}"` : '');
    // 根据用户配置，注入 flexible 脚本
    template = replacePlaceholderWithValue(template, HTML_PLACEHOLDERS.partialFlexible, config.useFlexible ? await getScaffoldContent('partialFlexible') : '');
    // 根据用户配置，自定义 favicon 图标
    const encodedFaviconLink = config.faviconLink ? encodeURI(config.faviconLink) : '';
    const faviconLinkContent = `href="${encodedFaviconLink || DEFAULT_VISE_CONFIG.faviconLink}"`;
    template = replacePlaceholderWithValue(template, HTML_PLACEHOLDERS.faviconLink, faviconLinkContent);
    // 根据用户配置，自定义 title
    const { defaultTitle } = config;
    template = replacePlaceholderWithValue(template, HTML_PLACEHOLDERS.title, `<!--START_TITLE--><title>${defaultTitle}</title><!--END_TITLE-->`);
    return template;
}
async function getMainTsContents(isProduction, config) {
    const { routerBase } = config;
    return replaceContentBetweenMarks({
        source: await getScaffoldContent('main'),
        mark: 'ROUTE_BASE',
        replacement: `const ROUTE_BASE = ${typeof routerBase === 'string'} ? '${routerBase}' : ${stringifyJSONWithRegExp(routerBase)}`,
    });
}
// 主要是将用户配置的同步、异步加载页面配置入 env.ts
async function getEnvTsContent(config) {
    const { routerSyncPages } = config;
    const isRouterSyncPagesNotEmpty = routerSyncPages?.length > 0;
    const isRouterSyncPagesMulti = routerSyncPages?.length > 1;
    const syncPagesStr = isRouterSyncPagesNotEmpty
        ? `${(routerSyncPages || []).join('|')}`
        : '';
    const syncPagesPattern = isRouterSyncPagesMulti
        ? `(${syncPagesStr})`
        : syncPagesStr;
    const excludeSyncPagesPattern = isRouterSyncPagesNotEmpty
        ? `!(${syncPagesStr})`
        : '*';
    const pagesPath = path.relative(getAppVisePath({ root: '/' }), '/src/pages');
    const replacedContent = replaceContentBetweenMarks({
        source: await getScaffoldContent('env'),
        mark: 'APP_PAGES',
        replacement: `import.meta.glob('${path.join(pagesPath, excludeSyncPagesPattern)}.vue');`,
    });
    return replaceContentBetweenMarks({
        source: replacedContent,
        mark: 'SYNC_APP_PAGES',
        replacement: syncPagesPattern
            ? `import.meta.globEager('${path.join(pagesPath, syncPagesPattern)}.vue');`
            : '{};',
    });
}
async function getServerEntryContent(isProduction, strictInitState) {
    let content = await getScaffoldContent('serverEntry');
    if (!strictInitState) {
        content = replaceContentBetweenMarks({
            source: content,
            mark: 'CONF_REPLACE',
            replacement: 'const strictInitState = false;',
        });
    }
    if (isProduction) {
        const clientPath = path.relative(getAppVisePath({ root: '/' }), '/dist/client');
        return replaceContentBetweenMarks({
            source: content,
            mark: 'TPL_REPLACE',
            replacement: `import manifest from '${path.join(clientPath, 'ssr-manifest.json')}';
  import template from '${path.join(clientPath, 'index.html?raw')}';`,
        });
    }
    return content;
}
function getVue3AppScaffoldModules(appRoot, isProduction, userConfig) {
    const appVisePath = getAppVisePath({ root: appRoot });
    return {
        [path.resolve(appRoot, SCAFFOLD_FILES.index)]: {
            async content() {
                return await getIndexHTML(isProduction, userConfig);
            },
        },
        [path.resolve(appRoot, 'src/server-hooks.ts')]: {
            async content() {
                return await getHooksContents(userConfig);
            },
        },
        [path.resolve(appVisePath, SCAFFOLD_FILES.clientEntry)]: {
            async content() {
                return await getScaffoldContent('clientEntry');
            },
        },
        [path.resolve(appVisePath, SCAFFOLD_FILES.router)]: {
            async content() {
                return await getScaffoldContent('router');
            },
        },
        [path.resolve(appVisePath, SCAFFOLD_FILES.main)]: {
            async content() {
                return await getMainTsContents(isProduction, userConfig);
            },
        },
        [path.resolve(appVisePath, SCAFFOLD_FILES.env)]: {
            async content() {
                return await getEnvTsContent(userConfig);
            },
        },
        [path.resolve(appVisePath, SCAFFOLD_FILES.serverEntry)]: {
            async content() {
                return await getServerEntryContent(isProduction, userConfig.strictInitState);
            },
        },
    };
}

function getUserScaffoldPlugin(appRoot, isProduction, userConfig) {
    switch (userConfig.scaffold) {
        case 'vue3-app':
            return [
                viseScaffold({
                    modules: getVue3AppScaffoldModules(appRoot, isProduction, userConfig),
                }),
                vue({
                    template: {
                        ssr: true,
                        compilerOptions: {
                            directiveTransforms: userConfig.directiveTransforms,
                            whitespace: 'condense',
                            comments: false,
                        },
                    },
                }),
            ];
    }
    return [];
}
/**
 * merge 将所有模式一致的 baseConfig, 具体模式下的 modeConfig 和 用户传入的 customConfig
 * 顺序是 baseConfig < modeConfig < customConfig
 * @return {*}  {Promise<UserConfigVite>}
 */
async function mergeWithBaseAndCustomConfig(appRoot, modeConfig) {
    const userConfig = await getAppViseConfig();
    const { hmrPort, ssr, base = '/', resolve = {}, build = {}, plugins = [], } = userConfig;
    const isProduction = modeConfig.mode === 'production';
    const modeDefaultConfig = mergeConfig$1({
        root: appRoot,
        build: {
            emptyOutDir: true,
        },
        resolve: {
            extensions: ['.ts', '.js'],
            alias: [
                { find: '~', replacement: path.resolve(appRoot, './') },
                { find: '@/', replacement: `${path.resolve(appRoot, 'src')}/` },
            ],
        },
        plugins: [
            nodeResolve({
                preferBuiltins: true,
            }),
            viseHtmlPost({
                isProduction,
                htmlFixedPositionFragments: userConfig.htmlFixedPositionFragments || [],
                minifyOption: userConfig.htmlMinify,
            }),
        ],
    }, modeConfig);
    return mergeConfig$1(modeDefaultConfig, {
        base,
        server: {
            hmr: {
                ...(hmrPort ? { port: hmrPort } : {}),
            },
        },
        ...(ssr ? { ssr } : {}),
        ...(resolve ? { resolve } : {}),
        ...(build ? { build } : {}),
        plugins: [
            ...plugins,
            ...getUserScaffoldPlugin(appRoot, isProduction, userConfig),
        ],
        // 存储一份原始配置，方便其它 plugin 使用
        // originalViseConfig: userConfig,
    });
}
/**
 * 获取 vite 开发环境配置
 *
 * @export
 * @param {string} appRoot
 * @return {*}  {Promise<UserConfigVite>}
 */
async function getViteDevConfig(appRoot) {
    return mergeWithBaseAndCustomConfig(appRoot, {
        mode: 'development',
        server: {
            middlewareMode: 'ssr',
            watch: {
                // During tests we edit the files too fast and sometimes chokidar
                // misses change events, so enforce polling for consistency
                usePolling: true,
                interval: 100,
            },
        },
        ssr: {
            external: [
                ...(await getDepsOfCore()),
            ],
        },
        build: {
            rollupOptions: {
                input: path.resolve(appRoot, 'index.html'),
            },
        },
    });
}
/**
 * 获取 vite 于客户端的生产构建配置
 *
 * @export
 * @param {string} appRoot
 * @return {*}  {Promise<UserConfigVite>}
 */
async function getViteClientConfig(appRoot) {
    return mergeWithBaseAndCustomConfig(appRoot, {
        mode: 'production',
        build: {
            sourcemap: true,
            manifest: true,
            ssrManifest: true,
            minify: 'terser',
            outDir: './dist/client',
        },
        plugins: [
            legacy(),
            visualizer({
                filename: 'client-stats.html',
                sourcemap: true,
                gzipSize: true,
                brotliSize: true,
            }),
        ],
    });
}
/**
 * 获取 vite 于服务端的生产构建配置
 *
 * @export
 * @param {string} appRoot
 * @return {*}  {Promise<UserConfigVite>}
 */
async function getViteServerConfig(appRoot) {
    const config = await mergeWithBaseAndCustomConfig(appRoot, {
        mode: 'production',
        build: {
            rollupOptions: {
                input: [
                    path.join(getAppVisePath({ root: appRoot }), 'entry-server.ts'),
                    path.resolve(appRoot, 'src/server-hooks.ts'),
                ],
                output: {
                    format: 'esm',
                },
            },
            sourcemap: true,
            ssr: true,
            minify: 'terser',
            outDir: './dist/server',
        },
        ssr: {
            external: ['@tencent/vise'],
        },
        plugins: [
            visualizer({
                filename: 'server-stats.html',
                sourcemap: true,
                gzipSize: true,
                brotliSize: true,
            }),
        ],
    });
    // 服务端打包不能应用 manualChunks，因为 vite 里面专门给有 ssr 配置项的流程设置了 inlineDynamicImports
    const output = config?.build?.rollupOptions?.output;
    if (output) {
        if (Array.isArray(output)) {
            config.build.rollupOptions.output = output.map(item => ({
                ...item,
                manualChunks: undefined,
            }));
        }
        else {
            output.manualChunks = undefined;
        }
    }
    return config;
}
async function getDepsOfCore() {
    const pkgJson = JSON.parse(await promises.readFile(path.resolve(DIR_NAME, '../package.json'), 'utf8'));
    return Object.keys(pkgJson.dependencies);
}

/*
 * @Description:
 * @usage:
 * @FilePath: /vise/packages/core/src/node/build.ts
 */
async function buildProject() {
    const appVisePath = getAppVisePath();
    const appRoot = getAppRoot();
    const appRootPagesPath = path.resolve(appRoot, 'src/pages');
    const viteClientConfig = await getViteClientConfig(appRoot);
    const viteServerConfig = await getViteServerConfig(appRoot);
    await prepareViseDir(appVisePath);
    await vite.build(viteClientConfig);
    await vite.build(viteServerConfig);
    await rename(`${appRoot}/dist/client/ssr-manifest.json`, `${appRoot}/dist/server/ssr-manifest.json`);
    // // 根据 pages/*.vue 复制对应名称的 html 文件，且 index 本来就有，不需要复制
    const filenames = glob.sync('*.vue', {
        cwd: appRootPagesPath,
    }).filter(filename => filename !== 'index.vue');
    const createEntriesForCSR = filenames.map((filename) => {
        const basename = path.basename(filename, '.vue');
        return copyFile(`${appRoot}/dist/client/index.html`, `${appRoot}/dist/client/${basename}.html`);
    });
    await Promise.all(createEntriesForCSR);
}

async function getViseVersion() {
    const PKG = await promises.readFile(path.resolve(DIR_NAME, '../package.json'), 'utf8');
    return JSON.parse(PKG).version;
}

const TEMPLATE_FILE_NAMES = [
    '_gitignore',
    '.eslintrc.cjs',
    'jest.config.ts',
    'tsconfig.json',
    'vise.config.ts',
    'package.json',
    'public',
    'src',
    'src/server-hooks.ts',
];
async function newVue3App() {
    const confirmCreation = await enquirer.prompt([
        {
            type: 'confirm',
            name: 'confirm',
            initial: true,
            message: `是否在 ${process.cwd()} 下创建项目`,
        },
    ]);
    if (!confirmCreation.confirm) {
        return;
    }
    const answers = await vue3AppAns();
    const { appName, config } = answers;
    const viseVersion = await getViseVersion();
    const newAppPath = path$1.resolve(process.cwd(), `./app-${appName}`);
    if (await fileExist(newAppPath)) {
        Logger.error(`已存在 app-${appName}，请勿重复创建`);
        return;
    }
    $.verbose = false;
    await $ `mkdir ${newAppPath}`;
    const allDone = await createTemplateFiles(newAppPath, viseVersion, appName, config);
    Logger.success(`🎉  app-${appName} 创建成功\n`);
    Logger.info(`👉  使用以下指令开始快速开发:

  ${chalk.cyan(`$ cd app-${appName}`)}
  ${chalk.cyan('$ npm install')}
  ${chalk.cyan('$ vise dev')}
  `);
    return allDone;
}
const vue3AppAns = async () => {
    // shell 获取默认用户名
    $.verbose = false;
    const defaultUser = (await $ `echo $USER`).stdout.replace(/[\r\n]/g, '');
    const answers = await enquirer.prompt([
        {
            type: 'input',
            name: 'appName',
            message: '项目名称',
            validate(value) {
                // 项目名称必须是以小写字母开头仅包含小写字母、数字和连接号 (-)
                const pattern = /^[a-z]+([0-9a-z-]*[0-9a-z]+)?$/;
                if (!pattern.test(value)) {
                    return '项目名称必须是以小写字母开头仅包含小写字母、数字和连接号 (-)';
                }
                return true;
            },
        },
        {
            type: 'form',
            name: 'config',
            message: '请输入项目信息（上下箭头切换）',
            choices: [
                { name: 'author', message: 'Author', initial: defaultUser },
                { name: 'desc', message: 'Description', initial: 'a Vise SSR project' },
                { name: 'devPort', message: 'DevPort(开发时使用的 http 端口)', initial: '3000' },
                { name: 'defaultTitle', message: '默认标题', initial: 'Vise App' },
            ],
        },
    ]);
    return answers;
};
const createTemplateFiles = (newAppPath, viseVersion, appName, config) => {
    const appTemplatePath = getNewAppTemplatePath('vue3-app');
    // 复制文件至新项目
    const { author, desc, devPort, defaultTitle } = config;
    const mySpinner = ora().start();
    mySpinner.color = 'green';
    // 这里并不关心最后这个数组的值，所以用 any 直接概括了
    return Promise.all(TEMPLATE_FILE_NAMES.map((item) => {
        let mainJobDone;
        switch (item) {
            case 'package.json':
                mainJobDone = createJsonFile(path$1.join(appTemplatePath, item), path$1.join(newAppPath, item), { author, description: desc, name: `@tencent/vise-app-${appName}`, dependencies: {
                        '@tencent/vise': viseVersion,
                    } });
                break;
            case 'vise.config.ts': {
                const viseConfigTemplate = setViseConfigTemplate(devPort, defaultTitle);
                mainJobDone = $ `echo ${viseConfigTemplate} > ${path$1.join(newAppPath, item)}`;
                break;
            }
            case 'src/server-hooks.ts':
                mainJobDone = createServerHooksTemplate(path$1.join(appTemplatePath, item), path$1.join(newAppPath, item), appName);
                break;
            case '_gitignore':
                mainJobDone = $ `cp -r ${path$1.join(appTemplatePath, item)} ${path$1.join(newAppPath, '.gitignore')}`;
                break;
            default:
                mainJobDone = $ `cp -r ${path$1.join(appTemplatePath, item)} ${path$1.join(newAppPath, item)}`;
                break;
        }
        mainJobDone.then(() => {
            mySpinner.succeed(`📄  Created ${item === '_gitignore' ? '.gitignore' : item}`);
        });
        return mainJobDone;
    }));
};
const setViseConfigTemplate = (devPort, defaultTitle) => {
    const configTemplate = `import type { ViseConfig } from '@tencent/vise';

const config: ViseConfig = {
  devPort: ${parseInt(devPort, 10)},
  hmrPort: 3008,
  htmlClass: '',
  defaultTitle: '${defaultTitle}',
  faviconLink: '',
  useFlexible: false,
  base: '/',
  routerBase: '/',
  strictInitState: false,
};

export default config;`;
    return configTemplate;
};
const createServerHooksTemplate = async (srcFile, targetFile, appName) => {
    const oldServerHooks = (await $ `cat ${srcFile}`).stdout;
    const newServerHooks = replacePlaceholderWithValue(oldServerHooks, 'serverHooksAppName', appName);
    return $ `echo ${newServerHooks} > ${targetFile}`;
};

async function createNewApp() {
    const answers = await enquirer.prompt([
        {
            type: 'select',
            message: '请选择项目类型：',
            name: 'templateType',
            choices: [
                // 目前只有 vue3 模板，后续考虑增加 vue2, react，vise-plugin
                'vue3-app',
            ],
        },
    ]);
    if (answers.templateType === 'vue3-app') {
        return newVue3App();
    }
}

const SERVE_MODE = {
    SINGLE: 'single',
    MULTI: 'multi',
};
async function serveProject(viseAppDir, options) {
    // 判断输入为单应用或多应用
    $.verbose = false;
    const targetAppDir = path$1.resolve(process.cwd(), viseAppDir ? viseAppDir : '');
    // 如果目标文件夹存在 package.json 或者 没有输入文件夹名 ，视为单应用处理
    const existPkgFiles = await fileExist(path$1.join(targetAppDir, './package.json'));
    return !viseAppDir || existPkgFiles
        ? serveSingleApp(targetAppDir, options) : serveMultiApps(targetAppDir, options);
}
const serveSingleApp = async (targetAppDir, options) => {
    // 检查是否有 src/server-hooks.ts 文件
    const existHookFile = await fileExist(path$1.join(targetAppDir, './src/server-hooks.ts'));
    if (!existHookFile) {
        Logger.error('不存在 server-hooks 文件，非 vise 项目');
        return;
    }
    // 检查是否有 dist/server/entry-server.js 文件
    const existEntryServe = await fileExist(path$1.join(targetAppDir, './dist/server/entry-server.js'));
    if (!existEntryServe) {
        Logger.error('请先在该项目内运行 vise build');
        return;
    }
    $.verbose = true;
    return callViseExpress(targetAppDir, options, SERVE_MODE.SINGLE);
};
const serveMultiApps = async (targetAppDir, options) => {
    const apps = (await $ `ls ${targetAppDir}`).stdout.split('\n').filter(app => !!app);
    // 判断 appname/server/server-hooks.js 是否全部存在
    const hookFilesNum = await countHookFiles(targetAppDir, apps);
    if (!hookFilesNum) {
        Logger.error('非法目录: 不支持 vise serve, 目录格式请见 vise 官网');
        return;
    }
    $.verbose = true;
    return callViseExpress(targetAppDir, options, SERVE_MODE.MULTI);
};
const countHookFiles = async (targetAppDir, apps) => {
    const existHookFileList = await Promise.all(apps
        .map((app) => {
        const hookFilePath = path$1.join(targetAppDir, `./${app}`, './server/server-hooks.js');
        return fileExist(hookFilePath);
    }));
    return existHookFileList.filter(o => !!o).length;
};
const callViseExpress = async (targetAppDir, options, appType) => {
    let typeCommand = '';
    if (appType === SERVE_MODE.MULTI) {
        typeCommand = '-b';
    }
    const optionsCommand = `-p ${options.port} -c ${options.enableCache} -r ${options.repeatRender}`;
    return await $ `vise-express start ${typeCommand} ${optionsCommand} ${targetAppDir}`;
};

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

/**
 * 判断是否纯对象
 *
 * @export
 * @param {*} obj
 * @return {*}  {boolean}
 */
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

const isTest = process.env.NODE_ENV === 'test' || !!process.env.VITE_TEST_BUILD;
const CODE_SERVER_ERROR = 500;
const DEV_RENDERER = 'vise:dev-server';
const SERVER_HOOK_CONFIG = 'src/server-hooks.ts';
const ALL_SCAFFOLD = {
    'vue3-app': SCAFFOLD_FILES,
};
// Default ssrFetcher to fetch data with axios by http
class ViseDevServer {
    appRoot;
    appVisePath;
    express;
    scaffold;
    port;
    viteServer;
    hookLifeCycle;
    hooks = {
        async render(renderContext) {
            const { request } = renderContext;
            const template = await this.viteServer.transformIndexHtml(request.url, '');
            const entryPath = this.resolve(ALL_SCAFFOLD[this.scaffold].serverEntry);
            const render = (await this.viteServer.ssrLoadModule(entryPath)).render;
            const ssrResult = await render(renderContext);
            if (!ssrResult || 'code' in ssrResult) {
                return {
                    type: 'error',
                    renderBy: DEV_RENDERER,
                    error: ssrResult ?? {
                        code: CODE_SERVER_ERROR,
                        message: 'Render fail',
                    },
                    context: renderContext,
                };
            }
            const { extra, ...newSsrResult } = ssrResult;
            const result = {
                renderBy: DEV_RENDERER,
                type: 'render',
                context: renderContext,
                ssrResult: {
                    ...newSsrResult,
                    template,
                },
            };
            return refillRenderResult(result);
        },
        async beforeResponse(renderResult) {
            this.log(`page render: ${renderResult.renderBy}`);
        },
    };
    routerBaseConfigs = {};
    constructor(appRoot, scaffold, port) {
        this.appRoot = appRoot;
        this.appVisePath = getAppVisePath({ root: appRoot });
        this.scaffold = scaffold;
        this.port = port;
        this.express = express();
        this.initHooks();
    }
    start() {
        this.express.listen(this.port, () => {
            this.log(`ssr server started: http://localhost:${this.port}`);
        });
    }
    async createServer() {
        await prepareViseDir(this.appVisePath);
        this.setupExpress();
        return {
            app: this.express,
            vite: this.viteServer,
        };
    }
    async loadAppHookConfig() {
        // 加载 app 服务端 hooks 文件
        const hookConfigFile = path.resolve(this.appRoot, SERVER_HOOK_CONFIG);
        return (await this.viteServer.ssrLoadModule(hookConfigFile)).default;
    }
    async initHooks() {
        try {
            await this.initViteServer();
            const hookConfig = await this.loadAppHookConfig();
            if (hookConfig) {
                const { appName, routerBaseConfig } = hookConfig;
                this.routerBaseConfigs[appName] = routerBaseConfig;
                this.hookLifeCycle = new HookLifeCycle(this.addServerPlugin(hookConfig), new HookLogger(this.log.bind(this)));
                this.log(`server hooks for app-${appName} installed`);
            }
            else {
                this.log('no server hooks found');
            }
        }
        catch (e) {
            console.error('[Vise] loadServerHooks fail', e);
            throw e;
        }
        this.createServer();
    }
    addServerPlugin(appHookConfig) {
        const bindedHooks = Object.keys(this.hooks).reduce((prev, hookName) => ({
            ...prev,
            [hookName]: this.hooks[hookName].bind(this),
        }), {});
        return {
            ...appHookConfig,
            plugins: [...appHookConfig.plugins ?? [], {
                    name: 'vise:dev-server',
                    hooks: bindedHooks,
                }],
        };
    }
    setupExpress() {
        const viteServer = this.viteServer;
        // use vite's connect instance as middleware
        this.express.use(viteServer.middlewares);
        this.express.use('*', (req, res) => {
            if (!this.hookLifeCycle) {
                this.sendResponse(res, {
                    code: 500,
                    headers: {},
                    body: 'Fail to init HookLifeCycle',
                });
                return;
            }
            const { projectName, routerBase } = matchAppForUrl(this.routerBaseConfigs, req.originalUrl);
            if (!projectName) {
                return;
            }
            const handleWithHookLifeCycle = async () => {
                try {
                    const response = await this.hookLifeCycle.start({
                        url: req.originalUrl,
                        headers: req.headers,
                        body: req.body,
                    }, {
                        routerBase,
                    });
                    this.sendResponse(res, response);
                }
                catch (e) {
                    const isError = (x) => typeof x.stack === 'string';
                    const msg = isError(e) ? e.stack : e;
                    if (isError(e)) {
                        viteServer.ssrFixStacktrace(e);
                    }
                    console.log(msg);
                    this.sendResponse(res, {
                        code: 500,
                        headers: {},
                        body: String(msg),
                    });
                }
            };
            handleWithHookLifeCycle();
        });
    }
    async initViteServer() {
        const viteDevConfig = await getViteDevConfig(this.appRoot);
        const config = mergeConfig(viteDevConfig, {
            logLevel: isTest ? 'error' : 'info',
        });
        const viteServer = await vite.createServer(config);
        this.viteServer = viteServer;
        return viteServer;
    }
    log(txt) {
        console.log(`[Vise] ${txt}`);
    }
    async sendResponse(res, data) {
        res.set(data.headers)
            .status(data.code)
            .end(data.body ?? '');
    }
    resolve(subPath) {
        return path.resolve(this.appVisePath, subPath);
    }
}
function createServer(projectScaffold, port) {
    const root = getAppRoot();
    return new ViseDevServer(root, projectScaffold, port);
}

async function init() {
    const program = new Command();
    const DEFAULT_PORT = 3000;
    program
        .name('vise')
        .description('Vise is a SSR framework for website. More info: https://vise.woa.com/')
        .version(await getViseVersion());
    program
        .command('build')
        .description('build vise project for production')
        .action(() => {
        buildProject();
    });
    program
        .command('dev')
        .description('launch dev web server')
        .option('-p,--port <port_number>', 'web port')
        .action(async (options) => {
        const config = await getAppViseConfig();
        const port = (options.port ? Number(options.port) : config.devPort) ?? DEFAULT_PORT;
        const server = createServer(config.scaffold, port);
        server.start();
    });
    program
        .command('create')
        .description('create new app')
        .action(() => {
        createNewApp();
    });
    program
        .command('serve')
        .description('start SSR HTTP server with built vise app dir or vise project bundles')
        .argument('[viseAppDir]')
        .option('-p, --port <port>', 'server listen port', String(DEFAULT_PORT))
        .option('-c, --enable-cache <trueOrFalse>', 'enable server cache', 'true')
        .option('-r, --repeat-render <times>', 'repeat ssr for benchmark test', '0')
        .action((viseAppDir, options) => {
        serveProject(viseAppDir, options);
    });
    program.parse(process.argv);
}
init();
