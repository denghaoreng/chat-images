# 核心 API — getContext() 全景指南

> 完整的 `getContext()` 实现见：`public/scripts/st-context.js`

## 概述

`SillyTavern.getContext()`（或简写 `getContext()`）是插件与 ST 核心交互的主要入口。通过它你可以访问聊天数据、角色列表、设置、事件系统、生成函数等几乎所有 ST 功能。

```javascript
const context = SillyTavern.getContext();
// 或（在 ES 模块中）
import { getContext } from '../../extensions.js';
```

> 官方推荐优先使用 `getContext()` 而非直接 import 内部模块，因为 Context API 更稳定，随版本更新的破坏性变更更少。

---

## 核心属性

### 聊天相关

| 属性 | 类型 | 说明 |
|------|------|------|
| `chat` | `Array` | 聊天记录数组（可变的） |
| `chatId` | `string` | 当前聊天 ID |
| `chatMetadata` | `object` | 当前聊天元数据 |
| `characters` | `Array` | 角色列表 |
| `characterId` | `number` | 当前角色在数组中的索引（群聊时为 `undefined`） |
| `groupId` | `string` | 当前群组 ID（非群聊时为 `undefined`） |
| `groups` | `Array` | 群组列表 |

### 用户信息

| 属性 | 类型 | 说明 |
|------|------|------|
| `name1` | `string` | 用户名称 |
| `name2` | `string` | 角色名称 |
| `mainApi` | `string` | 当前主 API 类型 |

### 设置

| 属性 | 类型 | 说明 |
|------|------|------|
| `extensionSettings` | `object` | 扩展设置（即 `extension_settings`） |
| `maxContext` | `number` | 最大上下文大小 |
| `onlineStatus` | `string` | 在线状态 |
| `powerUserSettings` | `object` | Power User 设置 |
| `chatCompletionSettings` | `object` | Chat Completion 设置（`oai_settings`） |
| `textCompletionSettings` | `object` | Text Completion 设置 |

---

## 核心方法

### 聊天操作

| 方法 | 说明 |
|------|------|
| `getCurrentChatId()` | 获取当前聊天 ID |
| `openCharacterChat(characterId)` | 打开角色聊天 |
| `openGroupChat(groupId)` | 打开群组聊天 |
| `reloadCurrentChat()` | 重新加载当前聊天 |
| `renameChat(chatId, name)` | 重命名聊天 |
| `saveChat()` | 保存当前聊天（防抖） |
| `saveMetadata()` | 保存聊天元数据 |
| `addOneMessage(message)` | 添加一条消息到聊天 |
| `deleteMessage(messageId)` | 删除指定消息 |
| `deleteLastMessage()` | 删除最后一条消息 |
| `sendSystemMessage(text)` | 发送系统消息 |
| `printMessages()` | 打印所有消息 |
| `clearChat()` | 清空聊天 |
| `updateMessageBlock(messageId)` | 更新消息块 |

### 生成文本

| 方法 | 说明 |
|------|------|
| `generateQuietPrompt(params)` | 在聊天环境中安静生成文本（不渲染到 UI） |
| `generateRaw(params)` | 原始生成，完全控制 prompt 构建 |
| `generateRawData(params)` | 生成原始数据 |
| `sendGenerationRequest(params)` | 发送生成请求 |
| `sendStreamingRequest(params)` | 发送流式生成请求 |
| `stopGeneration()` | 停止生成 |
| `Generate` | 生成函数（底层） |

### UI 控制

| 方法 | 说明 |
|------|------|
| `activateSendButtons()` | 激活发送按钮 |
| `deactivateSendButtons()` | 停用发送按钮 |
| `callPopup(html, options)` | **已废弃**。调用弹出窗口 |
| `callGenericPopup(html, type, options)` | 通用弹出窗口 |
| `showLoader()` | **已废弃**。显示加载器 |
| `hideLoader()` | **已废弃**。隐藏加载器 |
| `loader` | 新版 Action Loader 对象 |

### 工具与功能

| 方法 | 说明 |
|------|------|
| `substituteParams(text)` | 替换文本中的宏 |
| `substituteParamsExtended(text, extra)` | 扩展宏替换 |
| `getRequestHeaders()` | 获取请求头 |
| `getThumbnailUrl(url)` | 获取缩略图 URL |
| `getCharacters()` | 获取所有角色 |
| `getOneCharacter(id)` | 获取单个角色 |
| `getCharacterCardFields(character)` | 获取角色卡片字段 |
| `writeExtensionField(charId, key, value)` | 写入角色卡片扩展字段 |
| `writeExtensionFieldBulk(charId, data)` | 批量写入角色卡片扩展字段 |
| `registerSlashCommand(name, callback, aliases, help, group)` | **已废弃**。注册斜杠命令 |
| `executeSlashCommands(text)` | **已废弃**。执行斜杠命令 |
| `registerMacro(name, callback)` | **已废弃**。注册宏 |
| `unregisterMacro(name)` | **已废弃**。取消注册宏 |
| `registerFunctionTool(tool)` | 注册函数工具（Function Calling） |
| `unregisterFunctionTool(name)` | 取消注册函数工具 |
| `isToolCallingSupported()` | 检查工具调用是否支持 |
| `canPerformToolCalls()` | 检查是否可以执行工具调用 |
| `registerDebugFunction(id, name, description, callback)` | 注册调试功能 |
| `registerDataBankScraper(scraper)` | 注册数据采集器 |

### 其他

| 方法 | 说明 |
|------|------|
| `eventSource` | 事件发射器 |
| `eventTypes` | 事件类型常量（即 `event_types`） |
| `SlashCommandParser` | 斜杠命令解析器（新） |
| `SlashCommand` | 斜杠命令类 |
| `SlashCommandArgument` | 斜杠命令参数类 |
| `SlashCommandNamedArgument` | 斜杠命令命名参数类 |
| `ARGUMENT_TYPE` | 参数类型常量 |
| `macros` | 宏系统（新） |
| `Popup` / `POPUP_TYPE` / `POPUP_RESULT` | 弹出窗口系统 |
| `tokenizers` | 分词器 |
| `getTokenCount(text)` | **已废弃**。获取 token 数量 |
| `getTokenCountAsync(text, padding)` | 异步获取 token 数量 |
| `humanizedDateTime(timestamp)` | 格式化日期时间 |
| `uuidv4()` | 生成 UUID v4 |

---

## 文本生成详解

### 1. generateQuietPrompt — 聊天环境内安静生成

在聊天上下文中生成文本，输出不渲染到 UI：

```javascript
const { generateQuietPrompt } = SillyTavern.getContext();

const result = await generateQuietPrompt({
    quietPrompt: '请总结一下对话历史。',
    // 可选参数
    skipWIAN: true,              // 跳过世界书和作者注释
    responseLength: 200,         // 覆盖响应长度
    jsonSchema: { ... },         // 结构化输出模式
});
```

#### 🔍 Memory 插件的使用

```javascript
// 经典模式（Classic, blocking）
const params = {
    quietPrompt: prompt,
    skipWIAN: skipWIAN,
    responseLength: extension_settings.memory.overrideResponseLength,
};
summary = await generateQuietPrompt(params);
```

### 2. generateRaw — 原始生成

完全控制 prompt 构建，不依赖聊天上下文：

```javascript
const { generateRaw } = SillyTavern.getContext();

// Text Completion 模式
const result = await generateRaw({
    prompt: '生成一个关于勇敢骑士的故事。',
    systemPrompt: '你是一个有用的助手。',
    prefill: '从前，',           // assistant 预填充
    responseLength: 500,
    jsonSchema: { ... },         // 结构化输出
});

// Chat Completion 模式 — prompt 传数组
const result = await generateRaw({
    prompt: [
        { role: 'user', content: '生成一个故事' }
    ],
    systemPrompt: '你是一个创意写作助手。',
});
```

#### 🔍 Memory 插件的使用

```javascript
// 原始模式（Raw, blocking/non-blocking）
const { rawPrompt, lastUsedIndex } = await getRawSummaryPrompt(context, prompt);
const params = {
    prompt: rawPrompt,
    systemPrompt: prompt,
    responseLength: extension_settings.memory.overrideResponseLength,
};
const rawSummary = await generateRaw(params);
```

### 3. 结构化输出（Structured Outputs）

仅 Chat Completion API 支持。使用 JSON Schema 确保模型输出有效 JSON：

```javascript
const jsonSchema = {
    name: 'StoryStateModel',
    description: '故事状态模式',
    strict: true,
    value: {
        $schema: 'http://json-schema.org/draft-04/schema#',
        type: 'object',
        properties: {
            location: { type: 'string' },
            plans: { type: 'string' },
            memories: { type: 'string' },
        },
        required: ['location', 'plans', 'memories'],
    },
};

const result = await generateRaw({ prompt, jsonSchema });
// 返回 stringified JSON，失败时返回 '{}'
```

---

## HTML 模板渲染

使用 Handlebars 模板构建 UI：

```javascript
const { renderExtensionTemplateAsync } = SillyTavern.getContext();

// 渲染 third-party/my-extension/settings.html，传入数据
const html = await renderExtensionTemplateAsync(
    'third-party/my-extension',
    'settings',
    { title: '我的扩展', defaultValue: 'test' }
);

// 追加到扩展设置面板
$('#extensions_settings2').append(html);
```

模板文件示例（`settings.html`）：

```html
<div class="inline-drawer">
    <div class="inline-drawer-toggle inline-drawer-header">
        <b data-i18n="{{title}}">{{title}}</b>
        <div class="inline-drawer-icon fa-solid fa-circle-chevron-down down"></div>
    </div>
    <div class="inline-drawer-content">
        <label for="my_ext_option">
            <span data-i18n="Option">选项</span>
        </label>
        <input id="my_ext_option" type="text" value="{{defaultValue}}" />
    </div>
</div>
```

> `renderExtensionTemplate()`（同步版本）已废弃，请始终使用 `renderExtensionTemplateAsync()`。

---

## 共享库（Shared Libraries）

SillyTavern 在 `SillyTavern.libs` 中暴露了常用的 npm 库：

```javascript
const { DOMPurify, lodash, moment, Fuse, localforage, Handlebars, hljs, Popper, yaml } = SillyTavern.libs;
```

完整列表见 `public/lib.js`：

| 库名 | 说明 |
|------|------|
| `lodash` | 工具库 |
| `Fuse` | 模糊搜索 |
| `DOMPurify` | HTML 净化 |
| `hljs` | 语法高亮 |
| `localforage` | IndexedDB/localStorage 抽象 |
| `Handlebars` | 模板引擎 |
| `Popper` | 弹窗定位 |
| `moment` | 日期处理 |
| `yaml` | YAML 解析器 |
| `chevrotain` | 解析器构建工具 |
| `showdown` | Markdown 转换器 |
| `seedrandom` | 种子随机数生成器 |
| `droll` | 骰子投掷库 |

---

## 🔍 Memory 插件的工具函数分析

Memory 插件展示了一些重要的工具函数使用模式：

```javascript
// 1. 计算 Token 数
async function countSourceTokens(text, padding = 0) {
    if (source === 'webllm') return await countWebLlmTokens(text) + padding;
    if (source === 'extras') return getTextTokens(tokenizers.GPT2, text).length + padding;
    return await getTokenCountAsync(text, padding);
}

// 2. 获取上下文大小
async function getSourceContextSize() {
    if (source === 'webllm') {
        const maxContext = await getWebLlmContextSize();
        return overrideLength > 0 ? (maxContext - overrideLength) : Math.round(maxContext * 0.75);
    }
    if (source === 'extras') return 1024 - 64;
    return getMaxPromptTokens(overrideLength);
}

// 3. 防抖保存
const saveChatDebounced = debounce(() => getContext().saveChat(), debounce_timeout.relaxed);

// 4. 宏替换
const formatMemoryValue = function (value) {
    if (extension_settings.memory.template) {
        return substituteParamsExtended(extension_settings.memory.template, { summary: value });
    }
    return `Summary: ${value}`;
};

// 5. 设置扩展提示词注入
function setMemoryContext(value, saveToMessage, index = null) {
    setExtensionPrompt(
        MODULE_NAME,
        formatMemoryValue(value),
        extension_settings.memory.position,
        extension_settings.memory.depth,
        extension_settings.memory.scan,
        extension_settings.memory.role
    );
    // 同时更新 UI 和聊天记录
    $('#memory_contents').val(value);
    if (saveToMessage && context.chat.length) {
        mes.extra.memory = value;
        saveChatDebounced();
    }
}
```
