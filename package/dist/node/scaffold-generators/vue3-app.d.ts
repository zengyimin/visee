import { ParsedViseConfig } from '../app-config';
export declare const SCAFFOLD_FILES: {
    readonly index: "index.html";
    readonly partialFlexible: "partial-flexible.html";
    readonly main: "main.ts";
    readonly env: "env.ts";
    readonly router: "router.ts";
    readonly serverEntry: "entry-server.ts";
    readonly clientEntry: "entry-client.ts";
};
export declare function getIndexHTML(isProduction: boolean, config: ParsedViseConfig): Promise<string>;
export default function getVue3AppScaffoldModules(appRoot: string, isProduction: boolean, userConfig: ParsedViseConfig): {
    [x: string]: {
        content(): Promise<string>;
    };
};
