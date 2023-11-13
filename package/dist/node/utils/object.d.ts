import type { HashMap, JSONValue } from '../../';
/**
 * 判断是否纯对象
 *
 * @export
 * @param {*} obj
 * @return {*}  {boolean}
 */
export declare function isPureObject(obj: any): boolean;
/**
 * 删除无效的 key
 *
 * @export
 * @param {HashMap} obj
 * @return {*}  {HashMap}
 */
export declare function deleteInvalidKey(obj: HashMap): HashMap;
export declare const cloneDeep: (source: JSONValue) => JSONValue;
