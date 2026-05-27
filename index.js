// index.js — 聊天图片插件主入口
// 纯前端实现，使用 SillyTavern 内置 API，无需服务端插件

import { getContext, renderExtensionTemplateAsync } from '../../../extensions.js';
import { callGenericPopup, POPUP_TYPE } from '../../../popup.js';

// 模块名（必须唯一，用于 extensionSettings 的键名）
const MODULE_NAME = 'chat-images';
// 模板路径名（用于 renderExtensionTemplateAsync，需包含 third-party 前缀）
const TEMPLATE_NAME = 'third-party/chat-images';

// 当前设置
let currentSettings = {};
// 记录用户最后使用的标签页（null=首次/刷新后，默认显示角色集）
let lastActiveTab = null;

/** 生成唯一ID：年月日时分秒+4位随机数 */
function generateId(prefix) {
    const now = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    const ts = `${now.getFullYear()}${pad(now.getMonth()+1)}${pad(now.getDate())}${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
    const rand = Math.floor(1000 + Math.random() * 9000);
    return `${prefix}_${ts}_${rand}`;
}

// ==================== 默认设置 ====================

const defaultSettings = Object.freeze({
    enabled: true,
    autoDetect: true,
    showInChat: true,
    // 规则数据直接存储在 extensionSettings 中
    rulesData: {
        version: 1,
        charSets: [],
        ruleSets: [],
        rules: [],
    },
});

// ==================== 生命周期钩子 ====================

/**
 * activate 钩子：插件初始化
 */
export async function init() {
    // 加载设置（包含规则数据）
    loadSettings();

    // 添加 UI 控件到设置面板
    const settingsHtml = await renderExtensionTemplateAsync(TEMPLATE_NAME, 'settings', {});
    $('#extensions_settings').append(settingsHtml);

    // 添加导航栏抽屉
    addNavBarDrawer();

    // 注册事件监听
    registerEventListeners();

    // 将设置同步到 UI 控件
    applySettingsToUI();

    // 绑定 UI 事件
    bindUIEvents();

}

/**
 * install 钩子：首次安装
 */
export async function onInstall() {
    saveSettings();
}

/**
 * delete 钩子：插件被删除
 */
export async function onDelete() {
    // 清理 DOM 元素
    $('#chat-images-drawer').remove();
    $('#chat_images_container').remove();
}

/**
 * enable 钩子：插件启用
 */
export function onEnable() {
    registerEventListeners();
}

/**
 * disable 钩子：插件禁用
 */
export function onDisable() {
    const { eventSource, event_types } = getContext();
    eventSource.removeListener(event_types.CHARACTER_MESSAGE_RENDERED, onMessageReceived);
    eventSource.removeListener(event_types.MESSAGE_SWIPED, onMessageSwiped);
}

// ==================== 设置管理（包含规则数据） ====================

function loadSettings() {
    const { extensionSettings } = getContext();

    if (!extensionSettings[MODULE_NAME]) {
        extensionSettings[MODULE_NAME] = structuredClone(defaultSettings);
    }

    for (const [key, value] of Object.entries(defaultSettings)) {
        if (extensionSettings[MODULE_NAME][key] === undefined) {
            extensionSettings[MODULE_NAME][key] = structuredClone(value);
        }
    }

    currentSettings = extensionSettings[MODULE_NAME];

    // 数据迁移：清理引用已不存在的规则集的规则
    migrateOrphanedRules();
}

function migrateOrphanedRules() {
    const rulesData = getRulesData();
    const validSetIds = new Set((rulesData.ruleSets || []).map(s => s.id));
    let changed = false;
    for (let i = rulesData.rules.length - 1; i >= 0; i--) {
        const r = rulesData.rules[i];
        // 删除引用已不存在规则集的规则
        if (r.ruleSetId && !validSetIds.has(r.ruleSetId)) {
            rulesData.rules.splice(i, 1);
            changed = true;
        }
        // 删除被旧代码解除关联后残留的空规则（旧UUID格式ID，无图片，无规则集关联）
        else if (!r.ruleSetId && (!r.images || r.images.length === 0) && r.id && !r.id.includes('_20')) {
            rulesData.rules.splice(i, 1);
            changed = true;
        }
    }
    if (changed) saveSettings();
}

function saveSettings() {
    const { extensionSettings, saveSettingsDebounced } = getContext();
    extensionSettings[MODULE_NAME] = currentSettings;
    saveSettingsDebounced();
}

// ==================== 规则 CRUD（数据存储在 extensionSettings） ====================

function getRulesData() {
    return currentSettings.rulesData || { version: 1, rules: [] };
}

function getEnabledRules() {
    const rulesData = getRulesData();
    const activeSetIds = new Set((rulesData.ruleSets || []).filter(s => s.enabled).map(s => s.id));
    // 如果启用了角色图片集，只使用该角色集下的规则集
    const enabledCharSet = (rulesData.charSets || []).find(cs => cs.enabled);
    const effectiveSetIds = new Set();
    for (const rs of (rulesData.ruleSets || [])) {
        if (!rs.enabled) continue;
        if (enabledCharSet && rs.charSetId !== enabledCharSet.id) continue;
        effectiveSetIds.add(rs.id);
    }
    return rulesData.rules.filter(r => {
        if (!r.enabled) return false;
        if (r.ruleSetId) return effectiveSetIds.has(r.ruleSetId);
        return true; // 无规则集的规则始终参与
    });
}

function getRuleById(ruleId) {
    return getRulesData().rules.find(r => r.id === ruleId);
}

function addRule(rule) {
    const rulesData = getRulesData();
    const newRule = {
        id: generateId('rule'),
        name: rule.name || '新规则',
        regex: rule.regex || '',
        enabled: true,
        order: rule.order ?? 0,
        duration: rule.duration ?? 2,
        ruleSetId: rule.ruleSetId || '',
        images: [],
        _expanded: true,
    };
    rulesData.rules.unshift(newRule);
    saveSettings();
    return newRule;
}

function updateRule(ruleId, updates) {
    const rulesData = getRulesData();
    const rule = rulesData.rules.find(r => r.id === ruleId);
    if (!rule) return;
    Object.assign(rule, updates);
    saveSettings();
}

function deleteRule(ruleId) {
    const rulesData = getRulesData();
    const rule = rulesData.rules.find(r => r.id === ruleId);
    if (rule) {
        // 删除该规则下所有图片的服务端文件
        for (const img of (rule.images || [])) {
            if (img.path) {
                try {
                    const { getRequestHeaders } = SillyTavern.getContext();
                    fetch('/api/files/delete', {
                        method: 'POST',
                        headers: getRequestHeaders(),
                        body: JSON.stringify({ path: img.path.startsWith('/') ? img.path.substring(1) : img.path }),
                    }).catch(function() {});
                } catch (e) {/*ignore*/}
            }
        }
    }
    rulesData.rules = rulesData.rules.filter(r => r.id !== ruleId);
    saveSettings();
}

function addImageToRule(ruleId, imageMeta) {
    const rule = getRuleById(ruleId);
    if (!rule) return false;
    rule.images.push(imageMeta);
    saveSettings();
}

function updateImageWeight(ruleId, imageId, newWeight) {
    const rule = getRuleById(ruleId);
    if (!rule) return false;
    const img = rule.images.find(i => i.id === imageId);
    if (!img) return false;
    img.weight = newWeight;
    saveSettings();
}

function removeImageFromRule(ruleId, imageId) {
    const rule = getRuleById(ruleId);
    if (!rule) return false;
    rule.images = rule.images.filter(i => i.id !== imageId);
    saveSettings();
}

// ==================== 规则集 CRUD ====================

function getRuleSets() {
    return getRulesData().ruleSets || [];
}

function addRuleSet(name, charSetId) {
    const rulesData = getRulesData();
    if (!rulesData.ruleSets) rulesData.ruleSets = [];
    const newSet = {
        id: generateId('rs'),
        name: name || '新规则集',
        order: rulesData.ruleSets.length,
        enabled: true,
        charSetId: charSetId || '',
    };
    rulesData.ruleSets.push(newSet);
    saveSettings();
    return newSet;
}

function updateRuleSet(setId, updates) {
    const rulesData = getRulesData();
    const set = (rulesData.ruleSets || []).find(s => s.id === setId);
    if (!set) return;
    Object.assign(set, updates);
    saveSettings();
}

function deleteRuleSet(setId) {
    const rulesData = getRulesData();

    // 收集该规则集下所有规则的图片，逐一删除服务端文件
    const rulesToDelete = rulesData.rules.filter(r => r.ruleSetId === setId);
    for (const rule of rulesToDelete) {
        for (const img of (rule.images || [])) {
            if (img.path) {
                try {
                    const { getRequestHeaders } = SillyTavern.getContext();
                    fetch('/api/files/delete', {
                        method: 'POST',
                        headers: getRequestHeaders(),
                        body: JSON.stringify({ path: img.path.startsWith('/') ? img.path.substring(1) : img.path }),
                    }).catch(function() {});
                } catch (e) {/*ignore*/}
            }
        }
    }

    // 删除规则集及其下所有规则
    rulesData.ruleSets = (rulesData.ruleSets || []).filter(s => s.id !== setId);
    rulesData.rules = rulesData.rules.filter(r => r.ruleSetId !== setId);
    saveSettings();
}

// ==================== 角色图片集 CRUD ====================

function getCharSets() {
    return getRulesData().charSets || [];
}

function addCharSet(name) {
    const rulesData = getRulesData();
    if (!rulesData.charSets) rulesData.charSets = [];
    const newSet = {
        id: generateId('cs'),
        name: name || '新角色图片集',
        enabled: false,
    };
    rulesData.charSets.push(newSet);
    saveSettings();
    return newSet;
}

function updateCharSet(setId, updates) {
    const rulesData = getRulesData();
    const set = (rulesData.charSets || []).find(s => s.id === setId);
    if (!set) return;
    Object.assign(set, updates);
    // 只能启用一个角色图片集
    if (updates.enabled === true) {
        for (const s of (rulesData.charSets || [])) {
            if (s.id !== setId) s.enabled = false;
        }
    }
    saveSettings();
}

function deleteCharSet(setId) {
    const rulesData = getRulesData();

    // 找到该角色集下的所有规则集
    const rsToDelete = (rulesData.ruleSets || []).filter(rs => rs.charSetId === setId);
    for (const rs of rsToDelete) {
        // 删除规则集下的所有规则及其图片
        const rulesToDelete = rulesData.rules.filter(r => r.ruleSetId === rs.id);
        for (const rule of rulesToDelete) {
            for (const img of (rule.images || [])) {
                if (img.path) {
                    try {
                        const { getRequestHeaders } = SillyTavern.getContext();
                        fetch('/api/files/delete', {
                            method: 'POST',
                            headers: getRequestHeaders(),
                            body: JSON.stringify({ path: img.path.startsWith('/') ? img.path.substring(1) : img.path }),
                        }).catch(function() {});
                    } catch (e) {/*ignore*/}
                }
            }
        }
    }
    // 删除角色集下的所有规则集及其规则
    const rsIds = new Set(rsToDelete.map(rs => rs.id));
    rulesData.rules = rulesData.rules.filter(r => !rsIds.has(r.ruleSetId));
    rulesData.ruleSets = (rulesData.ruleSets || []).filter(rs => !rsIds.has(rs.id));
    // 删除角色集
    rulesData.charSets = (rulesData.charSets || []).filter(s => s.id !== setId);
    saveSettings();
}

// ==================== 图片管理（使用 SillyTavern 内置 /api/files/upload） ====================

/**
 * 获取图片 URL
 * 图片数据存储在 imageMeta.path 中（由 /api/files/upload 返回的相对路径）
 */
function getImageUrl(image) {
    if (!image?.path) return '';
    // 确保路径以 / 开头，使其成为相对于根路径的绝对 URL
    return image.path.startsWith('/') ? image.path : '/' + image.path;
}

function generateUniqueFilename(originalName) {
    const ext = originalName.split('.').pop();
    const now = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    const dateStr = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
    const rand = Math.floor(1000 + Math.random() * 9000);
    return `chat-images_${dateStr}_${rand}.${ext}`;
}

async function handleImageUpload(ruleId) {
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = 'image/png,image/jpeg,image/gif,image/webp';

    fileInput.onchange = async function(e) {
        const file = e.target.files[0];
        if (!file) return;

        const allowedTypes = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'];
        if (!allowedTypes.includes(file.type)) {
            toastr.warning('仅支持 PNG、JPEG、GIF、WebP 格式的图片');
            return;
        }

        const filename = generateUniqueFilename(file.name);

        const reader = new FileReader();
        reader.onload = async function(ev) {
            try {
                // 使用 SillyTavern 内置文件上传 API
                // FileReader.readAsDataURL 返回 "data:image/png;base64,..."
                // 服务器 writeFileSyncAtomic(data, 'base64') 需要纯 base64，去掉前缀
                const base64Data = ev.target.result.split(',')[1] || ev.target.result;
                const { getRequestHeaders } = getContext();
                const response = await fetch('/api/files/upload', {
                    method: 'POST',
                    headers: getRequestHeaders(),
                    body: JSON.stringify({
                        name: filename,
                        data: base64Data,
                    }),
                });

                if (!response.ok) {
                    throw new Error('上传失败');
                }

                const result = await response.json();
                // result.path 是相对 URL，如 "user/files/chat-images_xxx.png"

                // 创建元数据
                const imageMeta = {
                    id: generateId('img'),
                    filename: filename,
                    path: result.path,          // 服务端返回的文件路径
                    originalName: file.name,
                    name: file.name.replace(/\.[^/.]+$/, ''),
                    weight: 100,
                    uploadDate: new Date().toISOString(),
                    fileSize: file.size,
                };

                // 添加到规则
                const rulesData = getRulesData();
                const rule = rulesData.rules.find(r => r.id === ruleId);
                if (rule) {
                    rule.images.push(imageMeta);
                    saveSettings();
                    // 只刷新当前规则的图片列表，不重建整个规则列表（保持折叠状态）
                    const ruleEl = $(`.rule-item[data-rule-id="${ruleId}"]`);
                    const imagesContainer = ruleEl.find('.rule-images');
                    if (imagesContainer.length) {
                        imagesContainer.html(renderRuleImages(rule));
                    }
                    toastr.success('图片上传成功');
                }
            } catch (err) {
                console.error('聊天图片插件: 图片上传失败', err);
                toastr.error('图片上传失败');
            }
        };
        reader.readAsDataURL(file);
    };

    fileInput.click();
}

/**
 * 批量上传多张图片
 */
async function handleBatchImageUpload(ruleId) {
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.multiple = true;
    fileInput.accept = 'image/png,image/jpeg,image/gif,image/webp';

    fileInput.onchange = async function(e) {
        const files = Array.from(e.target.files);
        if (!files.length) return;

        const allowedTypes = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'];
        let successCount = 0;
        let failCount = 0;

        for (const file of files) {
            if (!allowedTypes.includes(file.type)) {
                failCount++;
                continue;
            }

            try {
                const base64Data = await new Promise((resolve, reject) => {
                    const reader = new FileReader();
                    reader.onload = (ev) => resolve(ev.target.result.split(',')[1] || ev.target.result);
                    reader.onerror = reject;
                    reader.readAsDataURL(file);
                });

                const filename = generateUniqueFilename(file.name);
                const { getRequestHeaders } = getContext();
                const response = await fetch('/api/files/upload', {
                    method: 'POST',
                    headers: getRequestHeaders(),
                    body: JSON.stringify({ name: filename, data: base64Data }),
                });

                if (!response.ok) throw new Error('上传失败');

                const result = await response.json();
                const imageMeta = {
                    id: generateId('img'),
                    filename: filename,
                    path: result.path,
                    originalName: file.name,
                    name: file.name.replace(/\.[^/.]+$/, ''),
                    weight: 100,
                    uploadDate: new Date().toISOString(),
                    fileSize: file.size,
                };

                const rulesData = getRulesData();
                const rule = rulesData.rules.find(r => r.id === ruleId);
                if (rule) {
                    rule.images.push(imageMeta);
                    successCount++;
                }
            } catch (err) {
                console.error('聊天图片插件: 批量上传失败', file.name, err);
                failCount++;
            }
        }

        saveSettings();
        const ruleEl = $(`.rule-item[data-rule-id="${ruleId}"]`);
        const imagesContainer = ruleEl.find('.rule-images');
        if (imagesContainer.length) {
            const rulesData = getRulesData();
            const rule = rulesData.rules.find(r => r.id === ruleId);
            if (rule) imagesContainer.html(renderRuleImages(rule));
        }

        if (successCount > 0) toastr.success(`成功上传 ${successCount} 张图片`);
        if (failCount > 0) toastr.warning(`${failCount} 张图片上传失败`);
    };

    fileInput.click();
}

/**
 * 显示正则表达式手册弹窗
 */
function showRegexHelp() {
    const helpHtml = `
    <style>
        .regex-help-table { width:100%; border-collapse: collapse; margin:6px 0; font-size:0.9em; }
        .regex-help-table th, .regex-help-table td { border:1px solid var(--borderColor); padding:6px 8px; text-align:left; }
        .regex-help-table th { background:var(--white30); font-weight:600; }
        .regex-help-table td:first-child { font-family:monospace; white-space:nowrap; color:var(--primary); font-weight:bold; }
        .regex-help-code { background:var(--white30); padding:1px 5px; border-radius:3px; font-family:monospace; font-size:0.9em; }
        .regex-help-note { background:var(--white15); border-left:3px solid var(--primary); padding:8px 12px; margin:8px 0; border-radius:0 4px 4px 0; font-size:0.88em; }
        .regex-help-title { font-size:1.1em; font-weight:bold; margin:12px 0 6px 0; padding-bottom:4px; border-bottom:1px solid var(--borderColor); }
        .regex-help-sub { font-size:0.95em; font-weight:600; margin:8px 0 4px 0; color:var(--primary); }
    </style>
    <div style="padding:4px 8px;font-size:0.92em;line-height:1.6;">
        <p>本插件的正则匹配基于 JavaScript <span class="regex-help-code">RegExp</span> 引擎，匹配时自动添加 <span class="regex-help-code">gi</span> 标志（全局、忽略大小写）。</p>

        <div class="regex-help-title">📖 基本用法</div>
        <p>在规则的"正则"输入框中输入模式，插件会用它对 AI 回复的文本进行匹配。<br>
        如果匹配成功，则按规则的权重随机选中一张绑定的图片插入到聊天中。</p>
        <div class="regex-help-note">
            <strong>💡 示例：</strong>输入 <span class="regex-help-code">微笑|开心|高兴</span>，当 AI 回复中包含"微笑"、"开心"或"高兴"时触发。
        </div>

        <div class="regex-help-title">🔤 直接量字符</div>
        <p>普通字符（除特殊符号外）直接匹配自身。</p>
        <table class="regex-help-table">
            <tr><th>模式</th><th>说明</th><th>匹配示例</th></tr>
            <tr><td>hello</td><td>直接匹配字符串 "hello"</td><td>"hello world" ✓</td></tr>
            <tr><td>攻击</td><td>直接匹配中文字符 "攻击"</td><td>"发动攻击" ✓</td></tr>
            <tr><td>\\n</td><td>匹配换行符</td><td>—</td></tr>
            <tr><td>\\t</td><td>匹配制表符</td><td>—</td></tr>
        </table>

        <div class="regex-help-title">🎯 特殊字符（需要转义）</div>
        <p>以下字符在正则中有特殊含义，如果要匹配它们本身，需要在前面加反斜杠 <span class="regex-help-code">\\</span> 。</p>
        <table class="regex-help-table">
            <tr><th>字符</th><th>含义</th><th>转义写法</th><th>说明</th></tr>
            <tr><td>.</td><td>匹配任意单个字符</td><td>\\.</td><td>匹配字面句号</td></tr>
            <tr><td>*</td><td>前一个字符重复 0 次或多次</td><td>\\*</td><td>匹配字面星号</td></tr>
            <tr><td>+</td><td>前一个字符重复 1 次或多次</td><td>\\+</td><td>匹配字面加号</td></tr>
            <tr><td>?</td><td>前一个字符出现 0 次或 1 次</td><td>\\?</td><td>匹配字面问号</td></tr>
            <tr><td>{ }</td><td>量词：指定重复次数</td><td>\\{ \\}</td><td>匹配字面花括号</td></tr>
            <tr><td>( )</td><td>分组/捕获</td><td>\\( \\)</td><td>匹配字面括号</td></tr>
            <tr><td>[ ]</td><td>字符集：匹配集合中的任意一个</td><td>\\[ \\]</td><td>匹配字面方括号</td></tr>
            <tr><td>|</td><td>或：匹配左边或右边的模式</td><td>\\|</td><td>匹配字面竖线</td></tr>
            <tr><td>^</td><td>开头断言 / 字符集内取反</td><td>\\^</td><td>匹配字面脱字符</td></tr>
            <tr><td>$</td><td>结尾断言</td><td>\\$</td><td>匹配字面美元符号</td></tr>
            <tr><td>\\</td><td>转义符本身</td><td>\\\\</td><td>匹配字面反斜杠</td></tr>
        </table>

        <div class="regex-help-title">📏 量词（重复次数）</div>
        <table class="regex-help-table">
            <tr><th>模式</th><th>说明</th><th>示例</th><th>匹配</th></tr>
            <tr><td>*</td><td>前一个字符出现 0 次或多次</td><td>ab*c</td><td>"ac","abc","abbc"</td></tr>
            <tr><td>+</td><td>前一个字符出现 1 次或多次</td><td>ab+c</td><td>"abc","abbc"（不匹配"ac"）</td></tr>
            <tr><td>?</td><td>前一个字符出现 0 次或 1 次</td><td>ab?c</td><td>"ac","abc"</td></tr>
            <tr><td>{n}</td><td>精确重复 n 次</td><td>a{3}</td><td>"aaa"</td></tr>
            <tr><td>{n,}</td><td>至少重复 n 次</td><td>a{2,}</td><td>"aa","aaa","aaaa"...</td></tr>
            <tr><td>{n,m}</td><td>重复 n 到 m 次</td><td>a{2,4}</td><td>"aa","aaa","aaaa"</td></tr>
        </table>

        <div class="regex-help-title">🔗 常用特殊模式</div>
        <table class="regex-help-table">
            <tr><th>模式</th><th>说明</th><th>等价于</th><th>示例</th></tr>
            <tr><td>.</td><td>匹配任意单个字符（除换行）</td><td>—</td><td>h.t → "hat","hot","hit"</td></tr>
            <tr><td>\\d</td><td>匹配一个数字</td><td>[0-9]</td><td>\\d{3} → "123"</td></tr>
            <tr><td>\\w</td><td>匹配一个字母/数字/下划线</td><td>[a-zA-Z0-9_]</td><td>\\w+ → "hello_123"</td></tr>
            <tr><td>\\s</td><td>匹配一个空白字符（空格/制表/换行）</td><td>[ \\t\\n\\r]</td><td>—</td></tr>
            <tr><td>\\D</td><td>匹配一个非数字</td><td>[^0-9]</td><td>—</td></tr>
            <tr><td>\\W</td><td>匹配一个非单词字符</td><td>[^a-zA-Z0-9_]</td><td>—</td></tr>
            <tr><td>\\S</td><td>匹配一个非空白字符</td><td>[^ \\t\\n\\r]</td><td>—</td></tr>
        </table>

        <div class="regex-help-title">🎭 字符集 [ ]</div>
        <table class="regex-help-table">
            <tr><th>模式</th><th>说明</th><th>示例</th></tr>
            <tr><td>[abc]</td><td>匹配 a、b、c 中的任意一个</td><td>b[ae]t → "bat","bet"</td></tr>
            <tr><td>[a-z]</td><td>匹配 a 到 z 的任意小写字母</td><td>[a-z]+ → "hello"</td></tr>
            <tr><td>[0-9]</td><td>匹配任意数字</td><td>[0-9]{2} → "42"</td></tr>
            <tr><td>[^abc]</td><td>匹配除 a、b、c 外的任意字符</td><td>[^0-9] → 匹配非数字</td></tr>
            <tr><td>[\\u4e00-\\u9fff]</td><td>匹配任意汉字</td><td>[\\u4e00-\\u9fff]+ → "你好世界"</td></tr>
        </table>

        <div class="regex-help-title">🔀 分组与逻辑</div>
        <table class="regex-help-table">
            <tr><th>模式</th><th>说明</th><th>示例</th></tr>
            <tr><td>AB|CD</td><td>或：匹配 AB 或 CD</td><td>攻击|防守 → 匹配"攻击"或"防守"</td></tr>
            <tr><td>(abc)</td><td>分组：将 abc 作为一个整体</td><td>(哈){3} → "哈哈哈"</td></tr>
            <tr><td>(?:abc)</td><td>非捕获分组：分组但不记录</td><td>—</td></tr>
        </table>

        <div class="regex-help-title">📍 位置断言</div>
        <table class="regex-help-table">
            <tr><th>模式</th><th>说明</th><th>示例</th></tr>
            <tr><td>^</td><td>字符串开头</td><td>^你好 → 匹配以"你好"开头的文本</td></tr>
            <tr><td>$</td><td>字符串结尾</td><td>再见$ → 匹配以"再见"结尾的文本</td></tr>
            <tr><td>\\b</td><td>单词边界</td><td>\\bword\\b → 匹配完整单词"word"</td></tr>
        </table>

        <div class="regex-help-title">💡 实用示例</div>
        <table class="regex-help-table">
            <tr><th>目的</th><th>正则模式</th><th>说明</th></tr>
            <tr><td>匹配表情</td><td>微笑|开心|大笑|笑了</td><td>用 | 分隔多个关键词</td></tr>
            <tr><td>匹配数字</td><td>\\d+</td><td>匹配任意长度的数字</td></tr>
            <tr><td>匹配百分比</td><td>\\d+%</td><td>如 "50%"、"100%"</td></tr>
            <tr><td>匹配动作描写</td><td>\\*[^*]+\\*</td><td>匹配被星号包裹的文字，如 *脸红*</td></tr>
            <tr><td>匹配引号内容</td><td>"[^"]+"</td><td>匹配双引号中的内容</td></tr>
            <tr><td>匹配问候语</td><td>^(你好|嗨|hello|hi)</td><td>匹配以问候语开头的文本</td></tr>
            <tr><td>匹配特定句式</td><td>（摇头|点头|叹气）</td><td>匹配括号内的动作词</td></tr>
            <tr><td>匹配汉字</td><td>[\\u4e00-\\u9fff]+</td><td>匹配连续的汉字</td></tr>
            <tr><td>匹配URL</td><td>https?://[^\\s]+</td><td>匹配 http/https 链接</td></tr>
            <tr><td>匹配感叹句</td><td>！|!|？|\\?</td><td>匹配感叹号或问号</td></tr>
            <tr><td>匹配重复语气词</td><td>(哈|啊|嗯){2,}</td><td>匹配重复的语气词如"哈哈哈"</td></tr>
            <tr><td>匹配情绪词</td><td>生气|愤怒|不开心|郁闷</td><td>多个情绪关键词</td></tr>
        </table>

        <div class="regex-help-title">⚠️ 注意事项</div>
        <ul style="margin:4px 0;padding-left:18px;">
            <li>匹配是<strong>大小写不敏感</strong>的（自动添加 <span class="regex-help-code">i</span> 标志）</li>
            <li>匹配是<strong>全局</strong>的（自动添加 <span class="regex-help-code">g</span> 标志）</li>
            <li>不要输入定界符 <span class="regex-help-code">/</span>，直接写模式即可</li>
            <li>支持 Unicode 中文匹配，无需特殊设置</li>
            <li>如果模式中有正则特殊字符（如 <span class="regex-help-code">. * + ? { } ( ) [ ] | \\ ^ $</span>），需要加 <span class="regex-help-code">\\</span> 转义</li>
            <li>规则启用后，会检查 AI 的<strong>每条新回复</strong>是否匹配</li>
            <li>同一规则集内的规则按"顺序"值从小到大依次匹配</li>
            <li>多个规则集按规则集顺序逐批处理</li>
        </ul>
    </div>`;

    callGenericPopup(helpHtml, POPUP_TYPE.TEXT, '', {
        okButton: '关闭',
        wide: true,
        large: true,
        allowVerticalScrolling: true,
    });
}

/**
 * 显示批量添加规则弹窗
 */
async function showBatchAddPopup() {
    const setId = $('#chat-images-ruleset-select').val();
    if (!setId || setId === '__unbound') {
        toastr.warning('请先选择一个规则集');
        return;
    }

    // 计算起始序号：当前规则集中最大的 order + 1
    const rulesData = getRulesData();
    const setRules = rulesData.rules.filter(r => r.ruleSetId === setId);
    const maxOrder = setRules.reduce((max, r) => Math.max(max, r.order || 0), 0);
    let nextOrder = maxOrder + 1;

    /** @type {Array<{file: File, dataUrl: string}>} */
    let uploadedImages = [];

    const popupContent = $(`
    <div id="chat-images-batch-popup" style="font-size:0.92em;min-width:500px;">
        <style>
            .batch-thumb { width:60px; height:60px; object-fit:cover; border-radius:4px; border:1px solid var(--borderColor); cursor:pointer; }
            .batch-thumb:hover { opacity:0.7; }
            .batch-thumb-item { position:relative; display:inline-block; }
            .batch-thumb-del { position:absolute; top:-6px; right:-6px; width:18px; height:18px; border-radius:50%; background:var(--dangerColor); color:#fff; font-size:11px; line-height:18px; text-align:center; cursor:pointer; }
        </style>
        <div class="flex-container flexFlowColumn" style="gap:8px;">
            <div class="flex-container alignitemscenter" style="gap:6px;">
                <span style="white-space:nowrap;font-weight:600;">批量规则名称</span>
                <input id="batch-rule-prefix" class="text_pole flex1" type="text" placeholder="例如: 表情_" value="">
                <span style="white-space:nowrap;font-weight:600;margin-left:4px;">留存</span>
                <input id="batch-rule-duration" class="text_pole" type="number" min="0" step="0.1" value="2" style="width:40px;text-align:center;" placeholder="秒" title="停留秒数：0=永久">
                <span style="font-size:0.75em;opacity:0.6;">秒</span>
                <button id="batch-upload-btn" class="menu_button menu_button_icon" title="批量上传图片">
                    <i class="fa-solid fa-images"></i>
                </button>
            </div>
            <div id="batch-thumb-list" class="flex-container flexWrap" style="gap:6px;min-height:40px;padding:4px;border:1px dashed var(--borderColor);border-radius:4px;">
                <span style="opacity:0.4;font-size:0.85em;">暂无图片</span>
            </div>
            <div>
                <div style="font-weight:600;margin-bottom:2px;">批量规则内容（共用正则）</div>
                <textarea id="batch-rule-regex" class="text_pole" rows="3" placeholder="输入正则表达式，所有规则共用此模式&#10;例如: 微笑|开心|高兴" style="width:100%;resize:vertical;"></textarea>
            </div>
        </div>
    </div>`);

    const popup = callGenericPopup(popupContent, POPUP_TYPE.TEXT, '', {
        okButton: '确认创建',
        cancelButton: '取消',
        wide: true,
        allowVerticalScrolling: true,
    });

    // 绑定弹窗内的事件
    $('#batch-upload-btn').on('click', function() {
        const input = document.createElement('input');
        input.type = 'file';
        input.multiple = true;
        input.accept = 'image/png,image/jpeg,image/gif,image/webp';
        input.onchange = function(e) {
            const files = Array.from(e.target.files);
            const allowedTypes = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'];
            for (const file of files) {
                if (!allowedTypes.includes(file.type)) continue;
                const reader = new FileReader();
                reader.onload = function(ev) {
                    uploadedImages.push({ file, dataUrl: ev.target.result });
                    renderBatchThumbs();
                };
                reader.readAsDataURL(file);
            }
        };
        input.click();
    });

    // 实时追踪表单值（弹窗关闭后 DOM 会被销毁，必须在关闭前捕获）
    let formPrefix = '批量规则';
    let formRegex = '';
    let formDuration = 2;
    $(document).on('input', '#batch-rule-prefix', function() { formPrefix = String($(this).val() || '').trim() || '批量规则'; });
    $(document).on('input', '#batch-rule-regex', function() { formRegex = String($(this).val() || '').trim(); });
    $(document).on('input', '#batch-rule-duration', function() { formDuration = parseFloat($(this).val()) || 2; });

    // 权重滑条实时更新显示值
    $(document).on('input', '.batch-thumb-weight', function() {
        const index = $(this).data('index');
        const val = $(this).val();
        $(this).siblings('.batch-thumb-weight-value').text(val);
        if (uploadedImages[index]) uploadedImages[index].weight = parseInt(val);
    });

    function renderBatchThumbs() {
        const container = $('#batch-thumb-list');
        if (uploadedImages.length === 0) {
            container.html('<span style="opacity:0.4;font-size:0.85em;">暂无图片</span>');
            return;
        }
        container.empty();
        uploadedImages.forEach((item, index) => {
            const weight = item.weight ?? 100;
            const thumb = $(`
                <div class="batch-thumb-item" data-index="${index}" style="text-align:center;">
                    <div style="position:relative;display:inline-block;">
                        <img class="batch-thumb" src="${item.dataUrl}" title="${item.file.name}">
                        <span class="batch-thumb-del" data-index="${index}">×</span>
                    </div>
                    <div class="rule-image-weight" style="margin-top:2px;">
                        <input type="range" class="batch-thumb-weight" data-index="${index}" min="0" max="100" value="${weight}" style="width:56px;height:4px;vertical-align:middle;">
                        <span class="batch-thumb-weight-value image-weight-value">${weight}</span>
                    </div>
                </div>
            `);
            thumb.find('.batch-thumb-del').on('click', function() {
                uploadedImages.splice(index, 1);
                renderBatchThumbs();
            });
            container.append(thumb);
        });
    }

    // 等待弹窗结果（表单值已通过 input 事件实时追踪到 formPrefix/formRegex/formDuration 中）
    const result = await popup;

    // 用户取消或关闭弹窗（null/undefined/0 都视为取消）
    if (result === null || result === undefined || result === false || result === 0) {
        return;
    }

    if (uploadedImages.length === 0) {
        toastr.warning('请至少上传一张图片');
        return;
    }

    // 开始逐个创建规则并上传图片
    let successCount = 0;
    let failCount = 0;

    for (let i = 0; i < uploadedImages.length; i++) {
        const item = uploadedImages[i];
        const ruleName = `${formPrefix}${nextOrder + i}`;

        try {
            // 上传图片到服务端
            const base64Data = item.dataUrl.split(',')[1] || item.dataUrl;
            const filename = generateUniqueFilename(item.file.name);
            const { getRequestHeaders } = getContext();
            const uploadRes = await fetch('/api/files/upload', {
                method: 'POST',
                headers: getRequestHeaders(),
                body: JSON.stringify({ name: filename, data: base64Data }),
            });
            if (!uploadRes.ok) throw new Error('上传失败');
            const uploadResult = await uploadRes.json();

            const imageMeta = {
                id: generateId('img'),
                filename: filename,
                path: uploadResult.path,
                originalName: item.file.name,
                name: item.file.name.replace(/\.[^/.]+$/, ''),
                weight: item.weight ?? 100,
                uploadDate: new Date().toISOString(),
                fileSize: item.file.size,
            };

            // 创建规则（带图片）
            const newRule = addRule({
                name: ruleName,
                regex: formRegex,
                ruleSetId: setId,
                order: nextOrder + i,
                duration: formDuration,
            });
            newRule.images.push(imageMeta);
            saveSettings();

            successCount++;
        } catch (err) {
            console.error('[聊天图片] 批量创建规则失败', err);
            failCount++;
        }
    }

    if (successCount > 0) {
        toastr.success(`成功创建 ${successCount} 条规则`);
        renderRuleList();
    }
    if (failCount > 0) toastr.warning(`${failCount} 条规则创建失败`);
}

/**
 * 删除图片文件（使用 SillyTavern 内置 /api/files/delete）
 */
async function deleteImageFile(image) {
    if (!image?.path) return;

    try {
        const { getRequestHeaders } = getContext();
        const response = await fetch('/api/files/delete', {
            method: 'POST',
            headers: getRequestHeaders(),
            body: JSON.stringify({ path: image.path }),
        });

        if (!response.ok && response.status !== 404) {
            console.warn('聊天图片插件: 删除图片文件返回状态', response.status);
        }
    } catch (e) {
        console.error('聊天图片插件: 删除图片文件失败', e);
    }
}

// ==================== 加权随机选择 ====================

function selectImageByWeight(images) {
    if (!images || images.length === 0) return null;

    // 计算总权重：undefined 的权重视为 0，不参与选择
    const totalWeight = images.reduce((sum, img) => sum + (img.weight || 0), 0);

    // 所有权重为 0 时，不选中任何图片
    if (totalWeight <= 0) {
        return null;
    }

    let random = Math.random() * totalWeight;
    for (const img of images) {
        random -= (img.weight || 0);
        if (random <= 0) return img;
    }
    return images[images.length - 1];
}

// ==================== 导航栏 Drawer ====================

function addNavBarDrawer() {
    if ($('#chat-images-drawer').length) return;

    const drawerHtml = `
    <div id="chat-images-drawer" class="drawer">
        <div class="drawer-toggle drawer-header">
            <div class="drawer-icon fa-solid fa-image fa-fw closedIcon" title="聊天图片"></div>
        </div>
        <div id="chat-images-panel" class="drawer-content closedDrawer">
            <div class="drawer-content-inner">
                <div class="chat-images-nav flex-container alignitemscenter" style="border-bottom:1px solid var(--borderColor);margin-bottom:8px;">
                    <span class="chat-images-tab chat-images-tab-active" data-tab="charsets" style="flex:1;text-align:center;padding:6px 0;cursor:pointer;font-size:0.9em;border-bottom:2px solid var(--primary);">角色集</span>
                    <span class="chat-images-tab" data-tab="rulesets" style="flex:1;text-align:center;padding:6px 0;cursor:pointer;font-size:0.9em;color:var(--grey40);">规则集</span>
                    <span class="chat-images-tab" data-tab="rules" style="flex:1;text-align:center;padding:6px 0;cursor:pointer;font-size:0.9em;color:var(--grey40);">规则</span>
                    <span id="chat-images-close-drawer" class="fa-solid fa-xmark menu_button menu_button_icon" style="margin-left:4px;"></span>
                </div>
                <div id="chat-images-rules-panel" style="display:none;">
                    <div style="text-align:center;margin:4px 0;">
                        <select id="chat-images-ruleset-select" class="text_pole" style="width:90%;font-size:0.9em;">
                            <option value="">未选择</option>
                            <option value="__unbound">未绑定</option>
                        </select>
                    </div>
                    <div style="text-align:center;margin:2px 0;">
                        <button id="chat-images-batch-add" class="menu_button" style="font-size:0.85em;width:90%;">
                            <i class="fa-solid fa-layer-group"></i> 批量添加规则
                        </button>
                    </div>
                    <div class="flex-container margin5 alignitemscenter" style="gap:5px;">
                        <input id="chat-images-search" class="text_pole flex1" type="text" placeholder="搜索规则..." style="flex:2;">
                        <select id="chat-images-sort" class="text_pole" style="width:auto;font-size:0.85em;">
                            <option value="order">顺序 ↑</option>
                            <option value="name">名称 ↑</option>
                            <option value="order_desc">顺序 ↓</option>
                            <option value="name_desc">名称 ↓</option>
                        </select>
                        <button id="chat-images-add-rule" class="menu_button menu_button_icon" title="添加规则">
                            <i class="fa-solid fa-plus"></i>
                        </button>
                    </div>
                    <div id="chat-images-rule-list" class="margin5"></div>
                </div>
                <div id="chat-images-rulesets-panel" style="display:none;">
                    <div style="text-align:center;margin:4px 0;">
                        <select id="chat-images-ruleset-charselect" class="text_pole" style="width:90%;font-size:0.9em;">
                            <option value="">未选择</option>
                            <option value="__unbound">未绑定</option>
                        </select>
                    </div>
                    <div class="flex-container margin5 alignitemscenter" style="gap:5px;">
                        <input id="chat-images-ruleset-search" class="text_pole" type="text" placeholder="搜索规则集..." style="flex:2;">
                        <select id="chat-images-ruleset-sort" class="text_pole" style="width:auto;font-size:0.85em;">
                            <option value="order">顺序 ↑</option>
                            <option value="name">名称 ↑</option>
                            <option value="order_desc">顺序 ↓</option>
                            <option value="name_desc">名称 ↓</option>
                        </select>
                        <button id="chat-images-add-ruleset" class="menu_button menu_button_icon" title="新增规则集">
                            <i class="fa-solid fa-plus"></i>
                        </button>
                    </div>
                    <div id="chat-images-ruleset-list" class="margin5"></div>
                    </div>
                <div id="chat-images-charsets-panel">
                    <div class="flex-container margin5 alignitemscenter" style="gap:5px;">
                        <input id="chat-images-char-set-search" class="text_pole flex1" type="text" placeholder="搜索角色集..." style="flex:2;">
                        <button id="chat-images-add-char-set" class="menu_button menu_button_icon" title="新增角色图片集">
                            <i class="fa-solid fa-plus"></i>
                        </button>
                    </div>
                    <div id="chat-images-char-set-list" class="margin5"></div>
                </div>
            </div>
        </div>
    </div>`;

    // 先添加到导航栏，再移动到用户设定管理前面
    $('#top-settings-holder').append(drawerHtml);
    $('#chat-images-drawer').insertBefore('#user-settings-button');

    // 绑定抽屉切换事件
    $('#chat-images-drawer .drawer-toggle').on('click', async function() {
        const { doNavbarIconClick } = await import('../../../../script.js');
        doNavbarIconClick.call(this);
        // 打开时：首次显示角色集，之后恢复上次的标签
        if ($('#chat-images-panel').hasClass('openDrawer')) {
            const tab = lastActiveTab || 'charsets';
            // 切换到目标标签
            $('.chat-images-tab').removeClass('chat-images-tab-active').css('border-bottom', '2px solid transparent').css('color', 'var(--grey40)');
            $(`.chat-images-tab[data-tab="${tab}"]`).addClass('chat-images-tab-active').css('border-bottom', '2px solid var(--primary)').css('color', '');
            $('#chat-images-rules-panel, #chat-images-rulesets-panel, #chat-images-charsets-panel').hide();
            $(`#chat-images-${tab}-panel`).show();
            if (tab === 'rules') {
                renderRuleList();
            } else if (tab === 'rulesets') {
                populateRuleSetCharDropdown();
                renderRuleSetList();
            } else {
                populateRuleSetDropdown();
                populateRuleSetCharDropdown();
                renderCharSetList();
            }
            updateAddButtons();
        }
    });

    // 关闭按钮
    $('#chat-images-close-drawer').on('click', function() {
        $('#chat-images-drawer .drawer-toggle').trigger('click');
    });
}

// ==================== 图片插入消息 ====================

/**
 * 将图片渲染到消息的 mes_media_wrapper DOM 中
 * @param {number} messageId - 消息在 chat 数组中的索引
 * @param {Array} images - 图片列表 [{url, name}]
 */
function renderImagesInDom(messageId, images) {
    if (!images || !images.length) return;

    const messageEl = $(`.mes[mesid="${messageId}"]`);
    if (!messageEl.length) return;

    let mediaWrapper = messageEl.find('.mes_media_wrapper');
    if (!mediaWrapper.length) return;

    for (const img of images) {
        const imgUrl = img.url || getImageUrl(img);
        if (!imgUrl) continue;

        // 去重
        if (mediaWrapper.find(`img[src="${imgUrl}"]`).length) continue;

        const imageHtml = `
        <div class="mes_media_container mes_img_container chat-image-queued" data-index="${Date.now()}">
            <div class="mes_img_controls">
                <div title="点击放大" class="right_menu_button fa-lg fa-solid fa-magnifying-glass chat-image-enlarge"></div>
            </div>
            <img class="mes_img" src="${imgUrl}" alt="${escapeHtml(img.name || '聊天图片')}" title="${escapeHtml(img.name || '聊天图片')}" onerror="chatImagesCleanupStaleImage(this)">
        </div>`;
        mediaWrapper.append(imageHtml);
    }
}

/**
 * 将图片保存到消息的 extra.chatImages 中确保持久化
 * @param {number} messageId - 消息在 chat 数组中的索引
 * @param {object} image - 图片元数据
 */
function persistImage(messageId, image) {
    const { chat, saveChat } = getContext();
    const message = chat[messageId];
    if (!message) return;

    if (!message.extra) message.extra = {};
    if (!message.extra.chatImages) message.extra.chatImages = [];

    const imgUrl = getImageUrl(image);
    if (!imgUrl) return;

    // 去重
    if (message.extra.chatImages.some(i => i.url === imgUrl)) return;

    message.extra.chatImages.push({
        url: imgUrl,
        name: image.name || '聊天图片',
        filename: image.filename,
    });

    saveChat();
}

/**
 * 将图片插入到指定消息
 * 同时渲染到 DOM 和持久化到 chat 数据
 * @param {number} messageId - 消息 ID
 * @param {object} image - 图片元数据
 */
function insertImageToMessage(messageId, image) {
    const imgUrl = getImageUrl(image);
    if (!imgUrl) return;

    // 持久化到消息数据
    persistImage(messageId, image);

    // 渲染到 DOM
    renderImagesInDom(messageId, [{
        url: imgUrl,
        name: image.name,
    }]);
}

// ==================== 事件监听 ===

// ==================== 事件监听 ====================

function registerEventListeners() {
    const { eventSource, event_types } = getContext();

    // 先移除旧监听，防止重复
    eventSource.removeListener(event_types.CHARACTER_MESSAGE_RENDERED, onMessageReceived);
    eventSource.removeListener(event_types.MESSAGE_SWIPED, onMessageSwiped);
    eventSource.removeListener(event_types.CHAT_LOADED, onChatLoaded);

    // 注册新监听
    eventSource.makeLast(event_types.CHARACTER_MESSAGE_RENDERED, onMessageReceived);
    eventSource.on(event_types.MESSAGE_SWIPED, onMessageSwiped);
    eventSource.on(event_types.CHAT_LOADED, onChatLoaded);

    // 自定义图片放大（不依赖 extra.media，避免图片被发送给模型）
    $(document).off('click', '.chat-image-enlarge').on('click', '.chat-image-enlarge', function() {
        const imgEl = $(this).closest('.mes_media_container').find('.mes_img')[0];
        if (!imgEl?.src) return;
        const overlay = document.createElement('div');
        overlay.className = 'img_enlarged_holder';
        overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.85);z-index:99999;display:flex;align-items:center;justify-content:center;cursor:zoom-out;';
        const enlargedImg = document.createElement('img');
        enlargedImg.src = imgEl.src;
        enlargedImg.style.cssText = 'max-width:90%;max-height:90%;object-fit:contain;border-radius:8px;box-shadow:0 0 30px rgba(0,0,0,0.5);';
        enlargedImg.className = 'img_enlarged';
        enlargedImg.addEventListener('click', function(e) { e.stopPropagation(); this.classList.toggle('zoomed'); });
        overlay.appendChild(enlargedImg);
        overlay.addEventListener('click', function() { document.body.removeChild(overlay); });
        document.body.appendChild(overlay);
    });
}

/**
 * 聊天加载完成后，遍历所有消息恢复已持久化的图片
 */
function onChatLoaded() {
    const { chat } = getContext();
    for (let i = 0; i < chat.length; i++) {
        const msg = chat[i];
        if (msg?.extra?.chatImages?.length) {
            renderImagesInDom(i, msg.extra.chatImages);
        }
    }
}

function onMessageReceived(data) {

    if (!currentSettings.enabled || !currentSettings.autoDetect) {
        return;
    }

    // CHARACTER_MESSAGE_RENDERED 传递的是消息 ID 或消息对象
    const { chat } = getContext();
    let messageId;
    let message;

    if (typeof data === 'object' && data !== null) {
        messageId = data.id;
        // 尝试从 chat 中按 ID 查找
        message = chat.find(m => m.id === messageId);
    } else if (typeof data === 'string') {
        messageId = data;
        message = chat.find(m => m.id === messageId);
    } else {
        messageId = data;
        message = chat.find(m => m.id === messageId);
    }

    // 如果没找到，用 chat 最后一条消息兜底
    if (!message) {
        message = chat[chat.length - 1];
    }

    if (!message) {
        return;
    }

    if (message.is_user) {
        return;
    }

    // 已有持久化图片的消息说明是重新渲染（分支切换、滑动等），跳过正则匹配
    if (message.extra?.chatImages?.length) {
        return;
    }

    const text = message.mes;

    if (!text) {
        return;
    }

    performMatch(text);
}

function onMessageSwiped() {
    if (!currentSettings.enabled || !currentSettings.autoDetect) {
        return;
    }

    const { chat } = getContext();
    const lastMsg = chat[chat.length - 1];
    const lastMsgId = chat.indexOf(lastMsg);

    if (!lastMsg || lastMsg.is_user) return;

    // 清除旧的持久化图片，重新匹配
    if (lastMsg.extra?.chatImages) {
        delete lastMsg.extra.chatImages;
    }

    performMatch(lastMsg.mes);
}

// ==================== 匹配逻辑 ====================

function performMatch(text) {
    if (!text) return;

    const enabledRules = getEnabledRules();
    if (enabledRules.length === 0) {
        console.log('[聊天图片] 无启用规则');
        return;
    }
    console.log('[聊天图片] 启用规则:', enabledRules.length, enabledRules.map(r => r.name + '(集:' + (r.ruleSetId || '无') + ')'));
    console.log('[聊天图片] 匹配文本前50字:', text.substring(0, 50));

    const matchedBatches = [];

    const rulesData = getRulesData();
    // 如果启用了角色图片集，只使用该角色集下的规则集
    let enabledCharSet = (rulesData.charSets || []).find(cs => cs.enabled);
    let ruleSets = (rulesData.ruleSets || []).filter(s => s.enabled);
    if (enabledCharSet) {
        ruleSets = ruleSets.filter(s => s.charSetId === enabledCharSet.id);
    }
    ruleSets.sort((a, b) => (a.order || 0) - (b.order || 0));
    console.log('[聊天图片] 启用规则集:', ruleSets.length, ruleSets.map(s => s.name + '(顺序:' + s.order + ')'));

    const ungroupedRules = enabledRules.filter(r => !r.ruleSetId).sort((a, b) => (a.order || 0) - (b.order || 0));
    const ungroupedItems = [];
    for (const rule of ungroupedRules) {
        const item = matchSingleRule(rule, text);
        if (item) {
            console.log('[聊天图片] 无集规则匹配:', rule.name, '图片:', item.image?.name);
            ungroupedItems.push(item);
        }
    }
    if (ungroupedItems.length > 0) {
        matchedBatches.push({ name: '未分组', items: ungroupedItems });
    }

    for (const rs of ruleSets) {
        const rsRules = enabledRules.filter(r => r.ruleSetId === rs.id).sort((a, b) => (a.order || 0) - (b.order || 0));
        console.log('[聊天图片] 规则集[' + rs.name + ']启用规则:', rsRules.length, rsRules.map(r => r.name + '(' + r.id + ')'));
        const rsItems = [];
        for (const rule of rsRules) {
            const item = matchSingleRule(rule, text);
            if (item) {
                rsItems.push(item);
            }
        }
        if (rsItems.length > 0) {
            matchedBatches.push({ name: rs.name, items: rsItems });
        } else {
            console.log('[聊天图片] 规则集[' + rs.name + ']无匹配');
        }
    }

    console.log('[聊天图片] 总批次:', matchedBatches.length);
    if (matchedBatches.length === 0) {
        return;
    }

    if (!currentSettings.showInChat) {
        return;
    }

    const { chat } = getContext();
    const lastMsg = chat[chat.length - 1];
    const lastMsgId = chat.indexOf(lastMsg);
    if (lastMsgId < 0) return;

    // 使用规则集批次队列展示
    queueBatchesForMessage(lastMsgId, matchedBatches);
}

/**
 * 测试单条规则是否匹配，返回匹配项
 */
function matchSingleRule(rule, text) {
    try {
        const pattern = sanitizeRegex(rule.regex);
        if (!pattern) {
            console.log('[聊天图片] 规则[' + rule.name + '][' + rule.id + ']正则表达式为空');
            return null;
        }
        const regex = new RegExp(pattern, 'gi');
        const matched = regex.test(text);
        if (!matched) {
            console.log('[聊天图片] 规则[' + rule.name + '][' + rule.id + ']正则未匹配文本:' + pattern);
            return null;
        }
        const images = rule.images || [];
        if (images.length === 0) {
            console.log('[聊天图片] 规则[' + rule.name + '][' + rule.id + ']没有图片');
            return null;
        }
        const selectedImage = selectImageByWeight(images);
        if (!selectedImage) {
            console.log('[聊天图片] 规则[' + rule.name + '][' + rule.id + ']图片权重全部为0');
            return null;
        }
        console.log('[聊天图片] 规则[' + rule.name + '][' + rule.id + ']匹配成功,选中图片:' + selectedImage.name);
        return {
            image: selectedImage,
            ruleId: rule.id,
            order: rule.order ?? 0,
            duration: rule.duration ?? 0,
        };
    } catch (e) {
        console.error(`[聊天图片] 规则 "${rule.name}" 的正则执行错误`, e);
    }
    return null;
}

// ==================== UI 渲染 ====================

function renderRuleList() {
    const container = $('#chat-images-rule-list');
    container.empty();

    const rulesData = getRulesData();
    const searchTerm = ($('#chat-images-search').val() || '').trim().toLowerCase();
    const selectedSetId = $('#chat-images-ruleset-select').val() || '';

    // 按规则集筛选（支持"未绑定"）
    if (!selectedSetId) {
        container.html('<div class="text-center" style="padding:20px;opacity:0.5;">请先选择一个规则集</div>');
        return;
    }
    let filtered;
    if (selectedSetId === '__unbound') {
        filtered = rulesData.rules.filter(r => !r.ruleSetId);
    } else {
        filtered = rulesData.rules.filter(r => r.ruleSetId === selectedSetId);
    }

    if (filtered.length === 0) {
        container.html('<div class="text-center" style="padding:20px;opacity:0.5;">此规则集暂无规则，点击 + 添加</div>');
        return;
    }

    // 模糊搜索
    const searched = searchTerm
        ? filtered.filter(r => r.name.toLowerCase().includes(searchTerm))
        : filtered;

    // 排序
    const sortBy = $('#chat-images-sort').val() || 'order';
    searched.sort(function(a, b) {
        switch (sortBy) {
            case 'name': return (a.name || '').localeCompare(b.name || '');
            case 'name_desc': return (b.name || '').localeCompare(a.name || '');
            case 'order_desc': return (b.order || 0) - (a.order || 0);
            default: return (a.order || 0) - (b.order || 0);
        }
    });

    if (searched.length === 0) {
        container.html('<div class="text-center" style="padding:20px;opacity:0.5;">未找到匹配的规则</div>');
        updateAddButtons();
        return;
    }

    updateAddButtons();

    for (const rule of searched) {
        const ruleElement = $(`
            <div class="rule-item" data-rule-id="${rule.id}">
                <div class="flex-container alignitemscenter margin0">
                    <span class="rule-collapse-btn fa-solid fa-chevron-${rule._expanded ? 'down' : 'right'} marginLeft5" title="展开/折叠"></span>
                    <input class="rule-name text_pole flex1" type="text" value="${escapeHtml(rule.name)}" placeholder="规则名称">
                    <label class="checkbox_label marginLeft5" style="margin-bottom:0;">
                        <input type="checkbox" class="rule-enabled" ${rule.enabled ? 'checked' : ''}>
                    </label>
                    <button class="rule-delete menu_button menu_button_icon" title="删除规则">
                        <i class="fa-solid fa-trash-can"></i>
                    </button>
                </div>
                <div class="rule-collapsible ${rule._expanded ? '' : 'collapsed'}">
                    <div class="flex-container alignitemscenter marginTop5" style="gap:4px;">
                        <input class="rule-order text_pole" type="number" min="0" step="0.1" value="${rule.order ?? 0}" style="width:40px;text-align:center;font-size:0.85em;" placeholder="顺序" title="顺序：数字越大越靠后执行">
                        <span style="font-size:0.75em;opacity:0.6;">排</span>
                        <input class="rule-duration text_pole" type="number" min="0" step="0.1" value="${rule.duration ?? 2}" style="width:36px;text-align:center;font-size:0.85em;margin-left:4px;" placeholder="秒" title="停留秒数：0=永久">
                        <span style="font-size:0.75em;opacity:0.6;margin-left:2px;">秒</span>
                        <button class="rule-add-image menu_button menu_button_icon" data-rule-id="${rule.id}" title="上传图片">
                            <i class="fa-solid fa-upload"></i>
                        </button>
                        <button class="rule-add-images-batch menu_button menu_button_icon" data-rule-id="${rule.id}" title="批量上传图片">
                            <i class="fa-solid fa-images"></i>
                        </button>
                        <button class="rule-regex-help menu_button menu_button_icon" title="正则表达式手册">
                            <i class="fa-solid fa-book"></i>
                        </button>
                    </div>
                    <div class="marginTop5">
                        <input class="rule-regex text_pole wide100p" type="text"
                               value="${escapeHtml(rule.regex)}" placeholder="输入正则表达式，如: 攻击|战斗|魔法">
                    </div>
                    <div class="rule-images marginTop5 flex-container flexWrap gap5px">
                        ${renderRuleImages(rule)}
                    </div>
                </div>
            </div>
        `);

        container.append(ruleElement);
        bindRuleEvents(ruleElement, rule);
    }
}

function renderRuleImages(rule) {
    if (rule.images.length === 0) {
        return '<span style="opacity:0.5;font-size:0.9em;">暂无图片</span>';
    }

    return rule.images.map(img => `
        <div class="rule-image-item" data-image-id="${img.id}">
            <div class="rule-image-thumb-wrapper">
                <img class="rule-image-thumb" src="${escapeHtml(getImageUrl(img))}"
                     title="${escapeHtml(img.name)}" loading="lazy"
                     onerror="chatImagesHandleImageError(this)">
                <div class="rule-image-thumb-fallback" style="display:none">
                    <i class="fa-solid fa-image"></i>
                </div>
            </div>
            <div class="rule-image-weight" title="权重：数值越高越容易被选中">
                <input type="range" min="0" max="100" value="${img.weight}"
                       class="image-weight-slider" data-image-id="${img.id}">
                <span class="image-weight-value">${img.weight}</span>
            </div>
            <button class="rule-image-delete menu_button menu_button_icon" title="删除图片">
                <i class="fa-solid fa-xmark"></i>
            </button>
        </div>
    `).join('');
}

// ==================== 规则集渲染 ====================

function renderRuleSetList() {
    const container = $('#chat-images-ruleset-list');
    container.empty();
    let ruleSets = getRuleSets();

    // 按角色集筛选
    const selectedCharId = $('#chat-images-ruleset-charselect').val() || '';
    if (selectedCharId === '__unbound') {
        ruleSets = ruleSets.filter(rs => !rs.charSetId);
    } else if (selectedCharId) {
        ruleSets = ruleSets.filter(rs => rs.charSetId === selectedCharId);
    }

    // 搜索过滤
    const searchTerm = ($('#chat-images-ruleset-search').val() || '').trim().toLowerCase();
    if (searchTerm) {
        ruleSets = ruleSets.filter(rs => rs.name.toLowerCase().includes(searchTerm));
    }

    // 排序
    const sortBy = $('#chat-images-ruleset-sort').val() || 'order';
    ruleSets.sort(function(a, b) {
        switch (sortBy) {
            case 'name': return (a.name || '').localeCompare(b.name || '');
            case 'name_desc': return (b.name || '').localeCompare(a.name || '');
            case 'order_desc': return (b.order || 0) - (a.order || 0);
            default: return (a.order || 0) - (b.order || 0);
        }
    });

    if (ruleSets.length === 0) {
        container.html('<div class="text-center" style="padding:20px;opacity:0.5;">' + (searchTerm ? '未找到匹配的规则集' : '暂无规则集，点击 + 添加') + '</div>');
        updateAddButtons();
        return;
    }

    updateAddButtons();

    for (const rs of ruleSets) {
        const rulesCount = (getRulesData().rules || []).filter(r => r.ruleSetId === rs.id).length;
        const element = $(`
            <div class="rule-item" data-ruleset-id="${rs.id}">
                <div class="flex-container alignitemscenter margin0">
                    <input class="ruleset-name text_pole flex1" type="text" value="${escapeHtml(rs.name)}" placeholder="规则集名称">
                    <input class="ruleset-order text_pole" type="number" min="0" step="0.1" value="${rs.order ?? 0}" style="width:40px;text-align:center;font-size:0.85em;" placeholder="顺序" title="顺序：数字越大越靠后执行">
                    <span style="font-size:0.75em;opacity:0.6;margin-left:2px;">排</span>
                    <label class="checkbox_label marginLeft5">
                        <input type="checkbox" class="ruleset-enabled" ${rs.enabled ? 'checked' : ''}>
                    </label>
                    <span class="ruleset-edit menu_button menu_button_icon marginLeft5" title="编辑规则集下的规则" style="font-size:0.8em;">
                        <i class="fa-solid fa-pen-to-square"></i>
                    </span>
                    <span style="font-size:0.75em;opacity:0.5;margin-left:2px;">${rulesCount}条</span>
                    <button class="ruleset-delete menu_button menu_button_icon marginLeft5" title="删除规则集">
                        <i class="fa-solid fa-trash-can"></i>
                    </button>
                </div>
            </div>
        `);
        container.append(element);
        bindRuleSetEvents(element, rs);
    }
}

function bindRuleSetEvents(element, rs) {
    element.find('.ruleset-name').on('input', function() {
        updateRuleSet(rs.id, { name: $(this).val() });
        populateRuleSetDropdown();
    });
    element.find('.ruleset-order').on('input', function() {
        updateRuleSet(rs.id, { order: parseFloat($(this).val()) || 0 });
    });
    element.find('.ruleset-enabled').on('change', function() {
        updateRuleSet(rs.id, { enabled: $(this).is(':checked') });
    });
    element.find('.ruleset-delete').on('click', function() {
        if (confirm(`确定删除规则集 "${rs.name}" 吗？关联的规则将变为未分组。`)) {
            deleteRuleSet(rs.id);
            renderRuleSetList();
            populateRuleSetDropdown();
        }
    });
    // 编辑按钮：跳转到规则标签并选中对应规则集
    element.find('.ruleset-edit').on('click', function() {
        lastActiveTab = 'rules';
        // 切换到规则标签
        $('#chat-images-rules-panel').show();
        $('#chat-images-rulesets-panel').hide();
        $('.chat-images-tab[data-tab="rules"]').addClass('chat-images-tab-active').css('border-bottom', '2px solid var(--primary)').css('color', '');
        $('.chat-images-tab[data-tab="rulesets"]').removeClass('chat-images-tab-active').css('border-bottom', '2px solid transparent').css('color', 'var(--grey40)');
        // 选中对应规则集
        $('#chat-images-ruleset-select').val(rs.id);
        renderRuleList();
        updateAddButtons();
    });
}

function populateRuleSetDropdown() {
    const select = $('#chat-images-ruleset-select');
    const selectedVal = select.val();
    select.empty();
    select.append('<option value="">未选择</option>');
    select.append('<option value="__unbound">未绑定</option>');
    const ruleSets = getRuleSets();
    for (const rs of ruleSets) {
        select.append(`<option value="${rs.id}">${escapeHtml(rs.name)}</option>`);
    }
    select.val(selectedVal || '');
    select.prop('size', Math.min(ruleSets.length + 2, 4));
}

function populateRuleSetCharDropdown() {
    const select = $('#chat-images-ruleset-charselect');
    const selectedVal = select.val();
    select.empty();
    select.append('<option value="">未选择</option>');
    select.append('<option value="__unbound">未绑定</option>');
    const charSets = getCharSets();
    for (const cs of charSets) {
        select.append(`<option value="${cs.id}">${escapeHtml(cs.name)}</option>`);
    }
    select.val(selectedVal || '');
    select.prop('size', Math.min(charSets.length + 2, 4));
}

// ==================== 角色图片集渲染 ====================

function renderCharSetList() {
    const container = $('#chat-images-char-set-list');
    container.empty();
    let charSets = getCharSets();
    const searchTerm = ($('#chat-images-char-set-search').val() || '').trim().toLowerCase();
    if (searchTerm) {
        charSets = charSets.filter(cs => cs.name.toLowerCase().includes(searchTerm));
    }
    if (charSets.length === 0) {
        container.html('<div class="text-center" style="padding:20px;opacity:0.5;">' + (searchTerm ? '未找到匹配的角色集' : '暂无角色图片集，点击 + 添加') + '</div>');
        return;
    }
    for (const cs of charSets) {
        const rsCount = (getRulesData().ruleSets || []).filter(rs => rs.charSetId === cs.id).length;
        const element = $(`
            <div class="rule-item" data-charset-id="${cs.id}">
                <div class="flex-container alignitemscenter margin0">
                    <input class="charset-name text_pole flex1" type="text" value="${escapeHtml(cs.name)}" placeholder="角色集名称">
                    <label class="checkbox_label marginLeft5">
                        <input type="checkbox" class="charset-enabled" ${cs.enabled ? 'checked' : ''}>
                        <span>${cs.enabled ? '启用中' : '启用'}</span>
                    </label>
                    <span class="charset-edit menu_button menu_button_icon marginLeft5" title="编辑此角色集下的规则集" style="font-size:0.8em;">
                        <i class="fa-solid fa-pen-to-square"></i>
                    </span>
                    <span style="font-size:0.75em;opacity:0.5;margin-left:2px;">${rsCount}规则集</span>
                    <button class="charset-delete menu_button menu_button_icon marginLeft5" title="删除角色图片集">
                        <i class="fa-solid fa-trash-can"></i>
                    </button>
                </div>
            </div>
        `);
        container.append(element);
        bindCharSetEvents(element, cs);
    }
}

function bindCharSetEvents(element, cs) {
    element.find('.charset-name').on('input', function() {
        updateCharSet(cs.id, { name: $(this).val() });
        populateRuleSetCharDropdown();
    });
    element.find('.charset-enabled').on('change', function() {
        updateCharSet(cs.id, { enabled: $(this).is(':checked') });
        renderCharSetList(); // 刷新以更新"启用中"显示
    });
    element.find('.charset-delete').on('click', function() {
        if (confirm(`确定删除角色图片集 "${cs.name}" 吗？`)) {
            deleteCharSet(cs.id);
            renderCharSetList();
            populateRuleSetCharDropdown();
        }
    });
    // 编辑按钮：跳转到规则集标签并选中对应角色集
    element.find('.charset-edit').on('click', function() {
        lastActiveTab = 'rulesets';
        $('#chat-images-charsets-panel').hide();
        $('#chat-images-rulesets-panel').show();
        $('#chat-images-rules-panel').hide();
        $('.chat-images-tab').removeClass('chat-images-tab-active').css('border-bottom', '2px solid transparent').css('color', 'var(--grey40)');
        $('.chat-images-tab[data-tab="rulesets"]').addClass('chat-images-tab-active').css('border-bottom', '2px solid var(--primary)').css('color', '');
        $('#chat-images-ruleset-charselect').val(cs.id);
        renderRuleSetList();
        updateAddButtons();
    });
}

function bindRuleEvents(ruleElement, rule) {
    // 规则名称变更
    ruleElement.find('.rule-name').on('input', function() {
        updateRule(rule.id, { name: $(this).val() });
    });

    // 顺序变更
    ruleElement.find('.rule-order').on('input', function() {
        updateRule(rule.id, { order: parseFloat($(this).val()) || 0 });
    });

    // 停留时间变更
    ruleElement.find('.rule-duration').on('input', function() {
        updateRule(rule.id, { duration: parseFloat($(this).val()) || 0 });
    });

    // 正则变更
    ruleElement.find('.rule-regex').on('input', function() {
        updateRule(rule.id, { regex: $(this).val() });
    });

    // 启用/禁用
    ruleElement.find('.rule-enabled').on('change', function() {
        updateRule(rule.id, { enabled: $(this).is(':checked') });
    });

    // 折叠/展开（状态持久化）
    ruleElement.find('.rule-collapse-btn').on('click', function() {
        const collapsible = ruleElement.find('.rule-collapsible');
        const isCollapsed = collapsible.hasClass('collapsed');
        collapsible.toggleClass('collapsed');
        $(this).toggleClass('fa-chevron-down fa-chevron-right');
        // 保存展开/折叠状态到规则数据
        updateRule(rule.id, { _expanded: isCollapsed });
    });

    // 删除规则
    ruleElement.find('.rule-delete').on('click', function() {
        if (confirm(`确定删除规则 "${rule.name}" 吗？`)) {
            deleteRule(rule.id);
            renderRuleList();
        }
    });

    // 添加图片
    ruleElement.find('.rule-add-image').on('click', function() {
        handleImageUpload(rule.id);
    });

    // 批量上传图片
    ruleElement.find('.rule-add-images-batch').on('click', function() {
        handleBatchImageUpload(rule.id);
    });

    // 正则手册
    ruleElement.find('.rule-regex-help').on('click', function() {
        showRegexHelp();
    });

    // 图片权重变更（使用事件委托，避免刷新后失效）
    ruleElement.on('input', '.image-weight-slider', function() {
        const imageId = $(this).data('image-id');
        const value = parseInt($(this).val());
        $(this).siblings('.image-weight-value').text(value);

        const img = rule.images.find(i => i.id === imageId);
        if (img) {
            img.weight = value;
            saveSettings();
        }
    });

    // 删除图片（使用事件委托，避免刷新后失效）
    ruleElement.on('click', '.rule-image-delete', async function() {
        const imageItem = $(this).closest('.rule-image-item');
        const imageId = imageItem.data('image-id');
        const img = rule.images.find(i => i.id === imageId);

        // 先删除服务端文件
        if (img) {
            await deleteImageFile(img);
        }

        rule.images = rule.images.filter(i => i.id !== imageId);
        saveSettings();
        // 仅移除 DOM 中的图片元素，保持折叠状态
        imageItem.remove();
    });
}

// ==================== 工具函数 ====================

/**
 * 净化用户输入的正则表达式，支持自动去除定界符和标志位
 * 用户可能习惯写 /pattern/gi 或 /pattern/，需要兼容
 * @param {string} input - 用户输入的正则字符串
 * @returns {string} 净化后的正模式
 */
function sanitizeRegex(input) {
    if (!input) return '';

    let pattern = input.trim();

    // 如果以 / 开头，尝试解析定界符格式：/pattern/flags
    if (pattern.startsWith('/')) {
        // 找到最后一个未被转义的 /
        let lastSlashIndex = -1;
        for (let i = pattern.length - 1; i > 0; i--) {
            if (pattern[i] === '/' && pattern[i - 1] !== '\\') {
                lastSlashIndex = i;
                break;
            }
        }
        if (lastSlashIndex > 0) {
            // 提取定界符之间的内容作为模式
            pattern = pattern.substring(1, lastSlashIndex);
        }
    }

    return pattern;
}

function escapeHtml(text) {
    if (!text) return '';
    return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}

/**
 * 全局函数：图片加载失败时，从规则数据和聊天消息数据中移除所有引用
 * （只清理数据，不会删除服务器上的文件）
 */
window.chatImagesCleanupStaleImage = function(imgEl) {
    const src = imgEl?.src;
    if (!src) return;
    console.warn('[聊天图片] 图片已失效，正在清理所有引用:', src);

    // 移除DOM
    imgEl?.closest('.mes_media_container')?.remove();

    // 1. 从所属规则的 images 中移除
    try {
        const container = imgEl?.closest('[data-rule-id]');
        const ruleId = container?.dataset?.ruleId;
        if (ruleId) {
            const { extensionSettings, saveSettingsDebounced } = SillyTavern.getContext();
            const rulesData = extensionSettings[MODULE_NAME]?.rulesData;
            if (rulesData) {
                const rule = rulesData.rules.find(r => r.id === ruleId);
                if (rule) {
                    const before = rule.images.length;
                    rule.images = rule.images.filter(img => {
                        const url = (img.path?.startsWith('/') ? '' : '/') + (img.path || '');
                        return (location.origin + url) !== src && url !== src;
                    });
                    if (rule.images.length !== before) {
                        saveSettingsDebounced();
                    }
                }
            }
        }
    } catch (e) {
        console.warn('[聊天图片] 清理规则数据失败:', e);
    }

    // 2. 从所有消息的 extra.chatImages 中移除
    try {
        const { chat, saveChat } = SillyTavern.getContext();
        let changed = false;
        for (let i = 0; i < chat.length; i++) {
            const images = chat[i]?.extra?.chatImages;
            if (images && Array.isArray(images)) {
                const before = images.length;
                chat[i].extra.chatImages = images.filter(img => img.url !== src);
                if (chat[i].extra.chatImages.length !== before) changed = true;
            }
        }
        if (changed) saveChat();
    } catch (e) {
        console.warn('[聊天图片] 清理聊天数据失败:', e);
    }
};
window.chatImagesHandleImageError = function(imgEl) {
    const wrapper = imgEl?.parentElement;
    if (wrapper) wrapper.classList.add('thumb-error');
    imgEl?.removeAttribute('onerror');

    const imageItem = imgEl?.closest('.rule-image-item');
    const ruleItem = imgEl?.closest('.rule-item');
    if (!imageItem || !ruleItem) return;

    const ruleId = ruleItem.dataset.ruleId;
    const imageId = imageItem.dataset.imageId;
    if (!ruleId || !imageId) return;

    // 直接操作 extensionSettings 清理
    try {
        const { extensionSettings, saveSettingsDebounced } = SillyTavern.getContext();
        const rulesData = extensionSettings[MODULE_NAME]?.rulesData;
        if (!rulesData) return;
        const rule = rulesData.rules.find(r => r.id === ruleId);
        if (!rule) return;
        const before = rule.images.length;
        rule.images = rule.images.filter(i => i.id !== imageId);
        if (rule.images.length !== before) {
            saveSettingsDebounced();
        }
    } catch (e) {
        console.warn('[聊天图片] 清理残留图片失败:', e);
    }
};



// ==================== 设置同步到 UI ====================

function applySettingsToUI() {
    const set = currentSettings;
    $('#chat-images-enabled').prop('checked', set.enabled);
    $('#chat-images-auto-detect').prop('checked', set.autoDetect);
    $('#chat-images-show-in-chat').prop('checked', set.showInChat);
}

/** 根据下拉框是否选中来控制新增按钮的禁用状态 */
function updateAddButtons() {
    const rsVal = $('#chat-images-ruleset-select').val();
    $('#chat-images-add-rule').prop('disabled', !rsVal || rsVal === '__unbound');
    const csVal = $('#chat-images-ruleset-charselect').val();
    $('#chat-images-add-ruleset').prop('disabled', !csVal || csVal === '__unbound');
}

// ==================== UI 事件绑定 ====================

function bindUIEvents() {
    // 标签切换（记录用户选择）
    $(document).off('click', '.chat-images-tab').on('click', '.chat-images-tab', function() {
        const tab = $(this).data('tab');
        lastActiveTab = tab;
        $('.chat-images-tab').removeClass('chat-images-tab-active').css('border-bottom', '2px solid transparent').css('color', 'var(--grey40)');
        $(this).addClass('chat-images-tab-active').css('border-bottom', '2px solid var(--primary)').css('color', '');
        if (tab === 'rules') {
            $('#chat-images-rules-panel').show();
            $('#chat-images-rulesets-panel').hide();
            $('#chat-images-charsets-panel').hide();
            renderRuleList();
        } else if (tab === 'rulesets') {
            $('#chat-images-rules-panel').hide();
            $('#chat-images-rulesets-panel').show();
            $('#chat-images-charsets-panel').hide();
            renderRuleSetList();
        } else {
            $('#chat-images-rules-panel').hide();
            $('#chat-images-rulesets-panel').hide();
            $('#chat-images-charsets-panel').show();
            renderCharSetList();
        }
    });

    // 规则集下拉筛选
    $(document).off('change', '#chat-images-ruleset-select').on('change', '#chat-images-ruleset-select', function() {
        renderRuleList();
    });

    // 排序切换
    $(document).off('change', '#chat-images-sort').on('change', '#chat-images-sort', function() {
        renderRuleList();
    });

    // 搜索框输入时重新渲染
    $(document).off('input', '#chat-images-search').on('input', '#chat-images-search', function() {
        renderRuleList();
    });

    // 添加规则按钮（顺序自动取当前规则集最大值+1）
    $(document).off('click', '#chat-images-add-rule').on('click', '#chat-images-add-rule', function() {
        const setId = $('#chat-images-ruleset-select').val() || '';
        const effectiveSetId = (setId === '__unbound') ? '' : setId;
        const rulesData = getRulesData();
        const setRules = rulesData.rules.filter(r => r.ruleSetId === effectiveSetId);
        const maxOrder = setRules.reduce((max, r) => Math.max(max, r.order || 0), 0);
        addRule({ name: '新规则', regex: '', ruleSetId: effectiveSetId, order: maxOrder + 1 });
        renderRuleList();
    });

    // 批量添加规则
    $(document).off('click', '#chat-images-batch-add').on('click', '#chat-images-batch-add', function() {
        showBatchAddPopup();
    });

    // 新增规则集（关联当前选择的角色集）
    $(document).off('click', '#chat-images-add-ruleset').on('click', '#chat-images-add-ruleset', function() {
        const charId = $('#chat-images-ruleset-charselect').val();
        const setId = (charId && charId !== '__unbound') ? charId : '';
        addRuleSet('新规则集', setId);
        renderRuleSetList();
        populateRuleSetDropdown();
    });

    // 规则集搜索
    $(document).off('input', '#chat-images-ruleset-search').on('input', '#chat-images-ruleset-search', function() {
        renderRuleSetList();
    });

    // 规则集排序
    $(document).off('change', '#chat-images-ruleset-sort').on('change', '#chat-images-ruleset-sort', function() {
        renderRuleSetList();
    });

    // 规则集-角色集筛选
    $(document).off('change', '#chat-images-ruleset-charselect').on('change', '#chat-images-ruleset-charselect', function() {
        renderRuleSetList();
    });

    // 新增角色集
    $(document).off('click', '#chat-images-add-char-set').on('click', '#chat-images-add-char-set', function() {
        addCharSet('新角色图片集');
        renderCharSetList();
        populateRuleSetCharDropdown();
    });

    // 角色集搜索
    $(document).off('input', '#chat-images-char-set-search').on('input', '#chat-images-char-set-search', function() {
        renderCharSetList();
    });

    // 设置面板控件绑定
    $(document).off('change', '#chat-images-enabled').on('change', '#chat-images-enabled', function() {
        currentSettings.enabled = $(this).is(':checked');
        saveSettings();
    });

    $(document).off('change', '#chat-images-auto-detect').on('change', '#chat-images-auto-detect', function() {
        currentSettings.autoDetect = $(this).is(':checked');
        saveSettings();
    });

    $(document).off('change', '#chat-images-show-in-chat').on('change', '#chat-images-show-in-chat', function() {
        currentSettings.showInChat = $(this).is(':checked');
        saveSettings();
    });
}

// ==================== 带顺序的图片队列 ====================

// 存储每个消息当前的图片队列定时器
const imageQueueTimers = new Map();

/**
 * 按规则集批次队列方式插入图片
 * 按规则集顺序逐批处理，每个规则集内按规则顺序排队
 * 前一个规则集全部执行完后，才轮到下一个规则集
 * @param {number} messageId
 * @param {Array} batches - [{name, items: [{image, order, duration}]}]
 */
function queueBatchesForMessage(messageId, batches) {
    console.log('[聊天图片] === 队列开始 ===');
    batches.forEach((b, i) => {
        console.log('  批次[' + i + ']:', b.name, b.items.length + '项');
        b.items.forEach((it, j) => console.log('    项[' + j + ']: order=' + it.order + ' dur=' + it.duration + 's img=' + it.image?.name));
    });

    // 清除该消息之前的定时器
    const oldTimer = imageQueueTimers.get(messageId);
    if (oldTimer) {
        clearTimeout(oldTimer);
    }

    let batchIndex = 0;

    function processNextBatch() {
        if (batchIndex >= batches.length) {
            return;
        }

        const batch = batches[batchIndex];

        // 对当前批次内的项按 order 排序
        const items = [...batch.items].sort((a, b) => (a.order || 0) - (b.order || 0));
        let itemIndex = 0;

        function showCurrentItem() {
            if (itemIndex >= items.length) {
                // 当前批次所有图片已展示完毕，进入下一批次
                batchIndex++;
                processNextBatch();
                return;
            }

            const item = items[itemIndex];
            const imgUrl = getImageUrl(item.image);

            // 移除当前消息中所有由本插件插入的图片（按文件名前缀 + class + data 属性三重匹配）
            const messageEl = $(`.mes[mesid="${messageId}"]`);
            // 通过聊天图片文件名前缀清理旧版本插入的图片
            messageEl.find('img[src*="chat-images_"]').closest('.mes_media_container').remove();
            // 再清理有标记的新版本图片
            messageEl.find('.chat-image-queued, [data-rule-id]').remove();

            if (!imgUrl || !messageEl.length) {
                itemIndex++;
                showCurrentItem();
                return;
            }

            const mediaWrapper = messageEl.find('.mes_media_wrapper');
            if (!mediaWrapper.length) return;

            const imageHtml = `
        <div class="mes_media_container mes_img_container chat-image-queued" data-index="${Date.now()}" data-rule-id="${item.ruleId || ''}">
            <div class="mes_img_controls">
                <div title="点击放大" class="right_menu_button fa-lg fa-solid fa-magnifying-glass chat-image-enlarge"></div>
            </div>
            <img class="mes_img" src="${imgUrl}" alt="${escapeHtml(item.image.name || '聊天图片')}" title="${escapeHtml(item.image.name || '聊天图片')}" onerror="chatImagesCleanupStaleImage(this)">
        </div>`;
            mediaWrapper.append(imageHtml);

            // 持久化（不写入 extra.media，避免图片被发送给模型）
            const { chat, saveChat } = getContext();
            const msg = chat[messageId];
            if (msg) {
                if (!msg.extra) msg.extra = {};
                msg.extra.chatImages = [{ url: imgUrl, name: item.image.name || '聊天图片', filename: item.image.filename }];
                saveChat();
            }

            itemIndex++;

            if (itemIndex < items.length && item.duration > 0) {
                // 还有下一项且当前有停留时间：定时替换
                const timer = setTimeout(showCurrentItem, item.duration * 1000);
                imageQueueTimers.set(messageId, timer);
            } else if (itemIndex >= items.length) {
                // 当前批次全部展示完
                if (item.duration > 0) {
                    // 最后一项也有停留时间：等待后再进入下一批次
                    const timer = setTimeout(function() {
                        batchIndex++;
                        processNextBatch();
                    }, item.duration * 1000);
                    imageQueueTimers.set(messageId, timer);
                } else {
                    // 最后一项停留时间为永久：立即进入下一批次
                    batchIndex++;
                    setTimeout(processNextBatch, 100);
                }
            }
            // 如果 duration <= 0 且还有下一项：停留时间为永久，不再展示本批次后续图片
        }

        showCurrentItem();
    }

    processNextBatch();
}
