import type { Plugin } from 'vite';
import type { Options } from 'html-minifier-terser';
import { HtmlFixedPositionFragment } from '../app-config';
declare type HtmlPostConfig = {
    isProduction: boolean;
    htmlFixedPositionFragments: HtmlFixedPositionFragment[];
    minifyOption: Options | boolean;
};
/**
 * html 后置插件
 *
 * @export
 * @param {HtmlPostConfig} config
 * @return {*}  {Plugin}
 */
export declare function viseHtmlPost(config: HtmlPostConfig): Plugin;
export {};
