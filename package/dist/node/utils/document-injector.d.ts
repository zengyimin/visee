declare type InjectorConfig = {
    placeholder: string;
    isProduction: boolean;
};
declare function htmlClassPropertyPlacehoderInjector(rootElement: Document, { placeholder }: InjectorConfig): Promise<void>;
declare const _default: {
    injector: typeof htmlClassPropertyPlacehoderInjector;
    placeholder: string;
}[];
export default _default;
