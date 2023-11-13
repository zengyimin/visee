import type { RenderContextExtra, SsrBundleSuccess } from '../../';
import type { SuccessRenderResult } from '../../hooks/';
interface MarksReplaceParam {
    source: string;
    mark: string;
    replacement: string | true;
    mode?: 'html' | 'script';
}
export declare function toKebab(camelString: string): string;
export declare function replaceContentBetweenMarks({ source, mark, replacement, mode, }: MarksReplaceParam): string;
export declare function replacePlaceholderWithValue(source: string, placeholderKey: string, replacement: string): string;
export declare function replaceContentOfFile(filePath: string, replacer: (ipt: string) => string): Promise<void>;
export declare function getPlaceholderOf(placeholderKey: string): string;
declare type PureSsrBundleResult = Omit<SsrBundleSuccess, 'extra'>;
export declare function fillSsrTemplate(ssrResult: PureSsrBundleResult, extra: Partial<RenderContextExtra>): string;
export declare function refillRenderResult(renderResult: SuccessRenderResult): SuccessRenderResult;
export {};
