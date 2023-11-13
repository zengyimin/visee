export declare function promisify(asyncCall: Function, context?: null): Function;
export declare function getAppRoot(): string;
export declare function getAppVisePath({ root, isUrlPath, }?: {
    root?: string | undefined;
    isUrlPath?: boolean | undefined;
}): string;
export declare function getNewAppTemplatePath(templateName: string): string;
export declare function getTemplateRuntimePath(templateName: string): string;
export declare function isInDir(subPath: string, rootPath?: string): boolean;
export declare function ensureDir(dirPath: string, needEmptyDir?: boolean): Promise<boolean>;
