# Vise
> 同构 SSR 开发框架

[Vise 官网](https://vise.woa.com)

Vise 读音[vaɪs]，是一个同构 SSR 开发框架，致力于打造开箱即用的同构 Web 页面开发体验。通过插件化方式，支持任意服务端框架与任意前端框架的组合使用。使用基于 esm、速度更快的 vite 代替常见 Webpack 作为开发构建工具，提供命令行工具支持一站式的开发、构建、发布 Web 应用，让业务项目可以关注在业务功能实现上。项目基于全方位 ESM 及 TypeScript。

Vise 将服务端渲染拆分为多个核心阶段，为每个阶段提供了基于 tapable 的 hooks，不管是服务端实现方、业务 app 实现方还是插件实现方，都可以将自己的逻辑通过 hooks 扩展纳入。Vise 同时基于 hooks 提供了可重用的 plugin 插件。

项目介绍: [Vise:Web SSR 服务端渲染同构框架](https://km.woa.com/articles/show/546256)

官网及详细文档: [https://vise.woa.com](https://vise.woa.com)

版本发布日志: [CHANGELOG](https://git.woa.com/wsWebGroup/vise/blob/master/packages/core/CHANGELOG.md)

# 整体设计
![Vise SSR framework 整体设计](https://vise.woa.com/ssr.drawio.png)
![Vise Hooks](https://vise.woa.com/tapable-hooks.png)
![Data Flow](https://vise.woa.com/data-flow.png)
![Render Process](https://vise.woa.com/render-process.png)
![SSR Cache](https://vise.woa.com/ssr-cache.png)
