import type { JSONValue } from '../../index';
/**
 * json对象转json字符串
 * @param { Object } json json对象
 */
export declare function stringifyJSONWithRegExp(json: Record<string, JSONValue | RegExp[]> | RegExp[]): string;
