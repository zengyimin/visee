export interface IVue3AppAns {
    templateType: string;
    appName: string;
    config: UserDefinedViseConfig;
}
declare type UserDefinedViseConfig = {
    author: string;
    desc: string;
    devPort: string;
    defaultTitle: string;
};
export default function newVue3App(): Promise<any[] | undefined>;
export {};
