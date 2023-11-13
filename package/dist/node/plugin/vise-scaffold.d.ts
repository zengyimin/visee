declare type ScaffoldModule = string | {
    content: string | (() => Promise<string>);
    virtual?: boolean;
};
declare type ScaffoldConfig = {
    modules: Record<string, ScaffoldModule>;
};
export declare function viseScaffold({ modules }: ScaffoldConfig): {
    name: string;
    enforce: string;
    resolveId(source: string, importer: string): string | undefined;
    load(id: string): Promise<any>;
    transformIndexHtml(html: string): Promise<string>;
};
export {};
