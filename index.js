// index.js — 聊天图片插件主入口（模块入口文件）
// 负责导入各子模块、声明生命周期钩子、绑定事件监听

import { getContext, renderExtensionTemplateAsync } from '../../../extensions.js';
import { loadSettings, saveSettings, currentSettings, MODULE_NAME } from './data.js';
import { addNavBarDrawer } from './drawer.js';
import { applySettingsToUI, bindUIEvents } from './rules-ui.js';
import { chatImageEnlarge } from './image.js';
import { performMatch } from './matcher.js';

// ==================== 生命周期钩子 ====================

export async function init() {
    loadSettings();
    const settingsHtml = await renderExtensionTemplateAsync('third-party/chat-images', 'settings', {});
    $('#extensions_settings').append(settingsHtml);
    addNavBarDrawer();
    registerEventListeners();
    applySettingsToUI();
    bindUIEvents();
}

export async function onInstall() {
    saveSettings();
}

export async function onDelete() {
    $('#chat-images-drawer').remove();
    $('#chat_images_container').remove();
}

export function onEnable() {
    registerEventListeners();
}

export function onDisable() {
    const { eventSource, event_types } = getContext();
    eventSource.removeListener(event_types.CHARACTER_MESSAGE_RENDERED, onMessageReceived);
    eventSource.removeListener(event_types.MESSAGE_SWIPED, onMessageSwiped);
    eventSource.removeListener(event_types.MESSAGE_UPDATED, onMessageUpdated);
    eventSource.removeListener(event_types.CHAT_LOADED, onChatLoaded);
}

// ==================== 事件监听 ====================

function registerEventListeners() {
    const { eventSource, event_types } = getContext();

    eventSource.removeListener(event_types.CHARACTER_MESSAGE_RENDERED, onMessageReceived);
    eventSource.removeListener(event_types.MESSAGE_SWIPED, onMessageSwiped);
    eventSource.removeListener(event_types.MESSAGE_UPDATED, onMessageUpdated);
    eventSource.removeListener(event_types.CHAT_LOADED, onChatLoaded);

    eventSource.makeLast(event_types.CHARACTER_MESSAGE_RENDERED, onMessageReceived);
    eventSource.on(event_types.MESSAGE_SWIPED, onMessageSwiped);
    eventSource.on(event_types.MESSAGE_UPDATED, onMessageUpdated);
    eventSource.on(event_types.CHAT_LOADED, onChatLoaded);

    // 自定义图片放大
    $(document).off('click', '.chat-image-enlarge').on('click', '.chat-image-enlarge', function () {
        const imgEl = $(this).closest('.mes_media_container').find('.mes_img')[0];
        chatImageEnlarge(imgEl);
    });

    // 双击/双指点击放大（兼容移动端）
    $(document).off('click', '.chat-image-queued .mes_img').on('click', '.chat-image-queued .mes_img', function () {
        const img = this;
        const now = Date.now();
        const lastTap = img._lastTap || 0;
        if (now - lastTap < 400) {
            chatImageEnlarge(img);
            img._lastTap = 0;
        } else {
            img._lastTap = now;
        }
    });
}

// ==================== 消息处理 ====================

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
    if (!currentSettings.enabled || !currentSettings.autoDetect) return;

    const { chat } = getContext();
    let messageId;
    let message;

    if (typeof data === 'object' && data !== null) {
        messageId = data.id;
        message = chat.find(m => m.id === messageId);
    } else {
        messageId = data;
        message = chat.find(m => m.id === messageId);
    }

    if (!message) message = chat[chat.length - 1];
    if (!message || message.is_user) return;
    if (message.extra?.chatImages?.length) return;

    const text = message.mes;
    if (!text) return;

    performMatch(text);
}

function onMessageSwiped() {
    if (!currentSettings.enabled || !currentSettings.autoDetect) return;

    const { chat } = getContext();
    const lastMsg = chat[chat.length - 1];
    const lastMsgId = chat.indexOf(lastMsg);

    if (!lastMsg || lastMsg.is_user) return;

    // 清除该消息的缓存图片
    delete lastMsg.extra?.chatImages;

    // 从 DOM 中移除旧的图片
    $(`.mes[mesid="${lastMsgId}"]`).find('.chat-image-queued').remove();

    // 消息已有文本 → 缓存滑动（无新生成），立即匹配
    // 消息无文本 → 新生成中，等 CHARACTER_MESSAGE_RENDERED 再匹配
    if (lastMsg.mes) {
        performMatch(lastMsg.mes);
    }
}

function onMessageUpdated(messageId) {
    if (!currentSettings.enabled || !currentSettings.autoDetect) return;

    const { chat } = getContext();
    const message = typeof messageId === 'number' ? chat[messageId] : chat[chat.length - 1];
    if (!message || message.is_user) return;
    if (message.extra?.chatImages?.length) return;

    const text = message.mes;
    if (!text) return;

    // 只处理最后一条消息，避免旧消息编辑时也触发
    if (chat.indexOf(message) !== chat.length - 1) return;

    performMatch(text);
}

// ==================== 图片渲染 ====================

function renderImagesInDom(messageId, images) {
    if (!images || !images.length) return;

    const messageEl = $(`.mes[mesid="${messageId}"]`);
    if (!messageEl.length) return;

    let mediaWrapper = messageEl.find('.mes_media_wrapper');
    if (!mediaWrapper.length) return;

    for (const img of images) {
        const imgUrl = img.url || (img.path ? (img.path.startsWith('/') ? img.path : '/' + img.path) : '');
        if (!imgUrl) continue;
        if (mediaWrapper.find(`img[src="${imgUrl}"]`).length) continue;

        const imageHtml = `
        <div class="mes_media_container mes_img_container chat-image-queued" data-index="${Date.now()}">
            <div class="mes_img_controls">
                <div title="点击放大" class="right_menu_button fa-lg fa-solid fa-magnifying-glass chat-image-enlarge"></div>
            </div>
            <div class="chat-image-frame">
                <img class="mes_img" src="${imgUrl}" alt="${escapeHtml(img.name || '聊天图片')}" title="${escapeHtml(img.name || '聊天图片')}" onerror="chatImagesCleanupStaleImage(this)">
            </div>
        </div>`;
        mediaWrapper.append(imageHtml);
    }
}

function escapeHtml(text) {
    if (!text) return '';
    return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}

// ==================== 全局函数（供 onerror 回调使用） ====================

window.chatImagesCleanupStaleImage = function (imgEl) {
    const src = imgEl?.src;
    if (!src) return;
    console.warn('[聊天图片] 图片已失效，正在清理所有引用:', src);

    imgEl?.closest('.mes_media_container')?.remove();

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
                    if (rule.images.length !== before) saveSettingsDebounced();
                }
            }
        }
    } catch (e) {
        console.warn('[聊天图片] 清理规则数据失败:', e);
    }

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

window.chatImagesHandleImageError = function (imgEl) {
    const wrapper = imgEl?.parentElement;
    if (wrapper) wrapper.classList.add('thumb-error');
    imgEl?.removeAttribute('onerror');

    const imageItem = imgEl?.closest('.rule-image-item');
    const ruleItem = imgEl?.closest('.rule-item');
    if (!imageItem || !ruleItem) return;

    const ruleId = ruleItem.dataset.ruleId;
    const imageId = imageItem.dataset.imageId;
    if (!ruleId || !imageId) return;

    try {
        const { extensionSettings, saveSettingsDebounced } = SillyTavern.getContext();
        const rulesData = extensionSettings[MODULE_NAME]?.rulesData;
        if (!rulesData) return;
        const rule = rulesData.rules.find(r => r.id === ruleId);
        if (!rule) return;
        const before = rule.images.length;
        rule.images = rule.images.filter(i => i.id !== imageId);
        if (rule.images.length !== before) saveSettingsDebounced();
    } catch (e) {
        console.warn('[聊天图片] 清理残留图片失败:', e);
    }
};
