# SillyTavern 插件开发完整指南

> 📚 基于官方文档（https://docs.sillytavern.app/for-contributors/writing-extensions/）  
> 结合内置 Memory (Summarize) 插件源码深度分析  
> 编写日期：2026年5月  
> 📁 原位于 `docs/image/docs-main/`，现移至 `docs/docs-main/`

## 📖 文档目录

| # | 文档 | 内容 |
|---|------|------|
| 1 | [插件开发总览](01-插件开发总览.md) | 架构介绍、目录结构、安装方式、学习路线 |
| 2 | [清单与生命周期](02-清单与生命周期.md) | manifest.json 全字段解析、生命周期钩子、加载机制 |
| 3 | [事件与状态管理](03-事件与状态管理.md) | 完整事件列表、持久化设置、聊天元数据、角色卡片数据 |
| 4 | [核心API](04-核心API.md) | getContext() 完整参考、文本生成、HTML模板、共享库 |
| 5 | [高级功能](05-高级功能.md) | 斜杠命令、宏、拦截器、Function Calling、弹窗 |
| 6 | [内存插件深度解析](06-内存插件深度解析.md) | Summarize 插件完整源码分析、设计模式 |
| 7 | [最佳实践](07-最佳实践.md) | 安全、性能、兼容性、完整模板 |
| 8 | [导航栏UI系统](02-导航栏UI系统.md) | 导航栏结构、抽屉机制、插件插入导航入口的方法 |

## 🔧 实战经验总结（来自聊天图片插件开发）

本指南中插入了以下实战经验，帮助你避免常见陷阱：

- **弹窗 DOM 生命周期**（见 `03-事件与状态管理.md`）：弹窗关闭后 DOM 被销毁，需实时监听输入值
- **两步法插入导航栏**（见 `02-清单与生命周期.md`）：先 append 再 insertBefore 确保位置稳定
- **事件委托**（见 `07-最佳实践.md`）：动态生成的元素需用父容器事件委托
- **移动端适配**（见 `07-最佳实践.md`）：`100dvh`、点击时间戳检测代替 `dblclick`、双指缩放
- **模块拆分**（见 `01-插件开发总览.md`）：复杂插件应拆分为 `data.js`、`ui.js`、`utils.js` 等
- **extensionSettings 存储限制**（见 `04-核心API.md`）：适合中小数据，大数据用 `localforage`
- **正则缓存自校正**：以 pattern 字符串为 key 的 Map 缓存，修改/删除规则后旧 key 自动失效，无需手动清除

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
