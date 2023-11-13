import express from 'express';
import vite from 'vite';
import { SupportedScaffold } from './app-config';
declare class ViseDevServer {
    private appRoot;
    private appVisePath;
    private express;
    private scaffold;
    private port;
    private viteServer;
    private hookLifeCycle;
    private hooks;
    private routerBaseConfigs;
    constructor(appRoot: string, scaffold: SupportedScaffold, port: number);
    start(): void;
    createServer(): Promise<{
        app: express.Express;
        vite: vite.ViteDevServer | undefined;
    }>;
    private loadAppHookConfig;
    private initHooks;
    private addServerPlugin;
    private setupExpress;
    private initViteServer;
    private log;
    private sendResponse;
    private resolve;
}
export default function createServer(projectScaffold: SupportedScaffold, port: number): ViseDevServer;
export {};
