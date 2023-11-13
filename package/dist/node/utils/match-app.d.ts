import type { HookRouterBase } from '../../hooks/hook-manager';
export default function matchAppForUrl(routerBaseConfigs: Record<string, HookRouterBase>, url: string): {
    projectName: string;
    routerBase: string;
};
