import { SSROptions, Alias, BuildOptions, UserConfig } from 'vite';
import { CompilerOptions } from '@vue/compiler-core';
import type { Options as HtmlMinifierTerserOptions } from 'html-minifier-terser';
import type { HttpHeaders } from '../';
export declare type SsrCacheKeyGenerator = (url: string, headers: HttpHeaders) => string;
export declare type SupportedScaffold = 'vue3-app';
export declare enum EHtmlFixedPositions {
    headEnd = "headEnd"
}
export interface HtmlFixedPositionFragment {
    position: EHtmlFixedPositions;
    content: string | (() => string);
}
export declare type ParsedViseConfig = {
    devPort: number;
    htmlClass: string | (() => string);
    htmlFixedPositionFragments: HtmlFixedPositionFragment[];
    defaultTitle: string;
    faviconLink: string;
    hmrPort: number;
    useFlexible: boolean;
    directiveTransforms: CompilerOptions['directiveTransforms'];
    ssr: SSROptions;
    base: string;
    routerSyncPages: string[];
    resolve: {
        alias?: Alias[];
    };
    plugins: UserConfig['plugins'];
    build: {
        rollupOptions?: BuildOptions['rollupOptions'];
        assetsInlineLimit?: number;
    };
    customTemplate: string;
    strictInitState: boolean;
    scaffold: SupportedScaffold;
    htmlMinify: HtmlMinifierTerserOptions | boolean;
    routerBase: RegExp[] | string;
};
export declare type ViseConfig = Partial<ParsedViseConfig>;
export declare const DEFAULT_VISE_CONFIG: ParsedViseConfig;
/**
 * 获取 vise 配置
 *
 * @export
 * @return {*}  {Promise<ViseConfig>}
 */
export default function getAppViseConfig(): Promise<ParsedViseConfig>;
