# SillyTavern 插件开发完整指南

> 📚 基于官方文档（https://docs.sillytavern.app/for-contributors/writing-extensions/）  
> 结合内置 Memory (Summarize) 插件源码深度分析  
> 编写日期：2026年5月

## 📖 文档目录

| # | 文档 | 内容 |
|---|------|------|
| 1 | [插件开发总览](01-插件开发总览.md) | 架构介绍、目录结构、安装方式、学习路线 |
| 2 | [清单与生命周期](02-清单与生命周期.md) | manifest.json 全字段解析、生命周期钩子、加载机制 |
| 3 | [事件与状态管理](03-事件与状态管理.md) | 完整事件列表、持久化设置、聊天元数据、角色卡片数据 |
| 4 | [核心API](04-核心API.md) | getContext() 完整参考、文本生成（静默/原始/结构化输出）、HTML模板、共享库 |
| 5 | [高级功能](05-高级功能.md) | 斜杠命令、宏、拦截器、Function Calling、消息格式化钩子、Action Loader、弹窗 |
| 6 | [内存插件深度解析](06-内存插件深度解析.md) | Summarize 插件完整源码分析（~1150行）、设计模式、架构拆解 |
| 7 | [最佳实践](07-最佳实践.md) | 安全、性能、兼容性、用户体验、代码质量和完整模板 |

## 🚀 快速阅读建议

- **初学者**: 从 `01-总览` → `02-清单与生命周期` → `03-事件与状态管理` 开始
- **进阶者**: 重点看 `04-核心API` → `05-高级功能`
- **实践者**: 配合 `06-内存插件深度解析` 和 `07-最佳实践` 对照学习
- **查阅者**: 直接使用 `04-核心API` 和 `05-高级功能` 作为 API 参考手册

## 🔗 官方资源

- **扩展开发文档**: https://docs.sillytavern.app/for-contributors/writing-extensions/
- **服务端插件**: https://docs.sillytavern.app/for-contributors/server-plugins/
- **Function Calling**: https://docs.sillytavern.app/for-contributors/function-calling/
- **STscript**: https://docs.sillytavern.app/usage/st-script/
- **内置插件源码**: `public/scripts/extensions/`
- **扩展加载器**: `public/scripts/extensions.js`
- **Context API**: `public/scripts/st-context.js`
- **事件类型**: `public/scripts/events.js`
- **共享库**: `public/lib.js`

## 📦 仓库与模板

| 资源 | 链接 |
|------|------|
| 基础示例 | https://github.com/city-unit/st-extension-example |
| Webpack 模板 | https://github.com/SillyTavern/Extension-WebpackTemplate |
| React 模板 | https://github.com/SillyTavern/Extension-ReactTemplate |
| 官方扩展列表 | https://github.com/search?q=topic%3Aextension+org%3ASillyTavern |
| 官方内容仓库 | https://github.com/SillyTavern/SillyTavern-Content |
