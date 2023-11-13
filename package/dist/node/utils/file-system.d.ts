/**
 * 判断文件是否存在
 * @param path 文件路径
 * @returns boolean 存在-true， 不存在-false
 */
export declare function fileExist(path: string): Promise<boolean>;
declare type ChangeDetail = {
    author: string;
    description: string;
    name: string;
    dependencies: Record<string, string>;
};
export declare function createJsonFile(src: string, target: string, changes: ChangeDetail): Promise<void>;
export {};
