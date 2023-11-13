import { UserConfig, SSROptions } from 'vite';
export interface UserConfigVite extends UserConfig {
    ssr?: SSROptions;
}
/**
 * 获取 vite 开发环境配置
 *
 * @export
 * @param {string} appRoot
 * @return {*}  {Promise<UserConfigVite>}
 */
export declare function getViteDevConfig(appRoot: string): Promise<UserConfigVite>;
/**
 * 获取 vite 于客户端的生产构建配置
 *
 * @export
 * @param {string} appRoot
 * @return {*}  {Promise<UserConfigVite>}
 */
export declare function getViteClientConfig(appRoot: string): Promise<UserConfigVite>;
/**
 * 获取 vite 于服务端的生产构建配置
 *
 * @export
 * @param {string} appRoot
 * @return {*}  {Promise<UserConfigVite>}
 */
export declare function getViteServerConfig(appRoot: string): Promise<UserConfigVite>;
