// matcher.js — 匹配引擎：正则匹配、加权随机、图片队列

import { getContext } from '../../../extensions.js';
import { getEnabledRules, getRulesData } from './data.js';
import { getImageUrl, deleteImageFile } from './image.js';
import { escapeHtml } from './utils.js';

// 存储每个消息当前的图片队列定时器
const imageQueueTimers = new Map();

// ==================== 正则预编译缓存 ====================

const regexCache = new Map();

function getCachedRegex(pattern) {
    if (!regexCache.has(pattern)) {
        try {
            regexCache.set(pattern, new RegExp(pattern, 'gi'));
        } catch (e) {
            regexCache.set(pattern, null);
        }
    }
    return regexCache.get(pattern);
}

/**
 * 规则变更时调用，清空正则缓存
 */
export function invalidateRegexCache() {
    regexCache.clear();
}

// ==================== 匹配逻辑 ====================

export function performMatch(text) {
    if (!text) return;

    const enabledRules = getEnabledRules();
    if (enabledRules.length === 0) {
        return;
    }

    const matchedBatches = [];
    const rulesData = getRulesData();
    let enabledCharSet = (rulesData.charSets || []).find(cs => cs.enabled);
    let ruleSets = (rulesData.ruleSets || []).filter(s => s.enabled);
    if (enabledCharSet) {
        ruleSets = ruleSets.filter(s => s.charSetId === enabledCharSet.id);
    }
    ruleSets.sort((a, b) => (a.order || 0) - (b.order || 0));

    const ungroupedRules = enabledRules.filter(r => !r.ruleSetId).sort((a, b) => (a.order || 0) - (b.order || 0));
    const ungroupedItems = [];
    for (const rule of ungroupedRules) {
        const item = matchSingleRule(rule, text);
        if (item) {
            ungroupedItems.push(item);
        }
    }
    if (ungroupedItems.length > 0) {
        matchedBatches.push({ name: '未分组', items: ungroupedItems });
    }

    for (const rs of ruleSets) {
        const rsRules = enabledRules.filter(r => r.ruleSetId === rs.id).sort((a, b) => (a.order || 0) - (b.order || 0));
        const rsItems = [];
        for (const rule of rsRules) {
            const item = matchSingleRule(rule, text);
            if (item) {
                rsItems.push(item);
            }
        }
        if (rsItems.length > 0) {
            matchedBatches.push({ name: rs.name, items: rsItems });
        }
    }

    if (matchedBatches.length === 0) return;

    const { chat } = getContext();
    const lastMsg = chat[chat.length - 1];
    const lastMsgId = chat.indexOf(lastMsg);
    if (lastMsgId < 0) return;

    queueBatchesForMessage(lastMsgId, matchedBatches);
}

export function matchSingleRule(rule, text) {
    try {
        const pattern = sanitizeRegex(rule.regex);
        if (!pattern) {
            return null;
        }
        const regex = getCachedRegex(pattern);
        if (!regex) return null;
        const matched = regex.test(text);
        if (!matched) {
            return null;
        }
        const images = rule.images || [];
        if (images.length === 0) {
            return null;
        }
        const selectedImage = selectImageByWeight(images);
        if (!selectedImage) {
            return null;
        }
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

// ==================== 加权随机选择 ====================

export function selectImageByWeight(images) {
    if (!images || images.length === 0) return null;
    const totalWeight = images.reduce((sum, img) => sum + (img.weight || 0), 0);
    if (totalWeight <= 0) return null;
    let random = Math.random() * totalWeight;
    for (const img of images) {
        random -= (img.weight || 0);
        if (random <= 0) return img;
    }
    return images[images.length - 1];
}

// ==================== 工具函数 ====================

export function sanitizeRegex(input) {
    if (!input) return '';
    let pattern = input.trim();
    if (pattern.startsWith('/')) {
        let lastSlashIndex = -1;
        for (let i = pattern.length - 1; i > 0; i--) {
            if (pattern[i] === '/' && pattern[i - 1] !== '\\') {
                lastSlashIndex = i;
                break;
            }
        }
        if (lastSlashIndex > 0) {
            pattern = pattern.substring(1, lastSlashIndex);
        }
    }
    return pattern;
}

// ==================== 图片队列（优化版） ====================

export function queueBatchesForMessage(messageId, batches) {
    // 清除旧定时器
    const oldTimer = imageQueueTimers.get(messageId);
    if (oldTimer) clearTimeout(oldTimer);

    // 预查 DOM 节点，只查一次
    const messageEl = $(`.mes[mesid="${messageId}"]`);
    if (!messageEl.length) return;
    let mediaWrapper = messageEl.find('.mes_media_wrapper');
    if (!mediaWrapper.length) return;

    // 创建或复用一个专用容器，避免反复删除重建
    let container = mediaWrapper.find('.chat-images-queue-container');
    const isNew = !container.length;
    if (isNew) {
        container = $('<div class="chat-images-queue-container"></div>');
        mediaWrapper.append(container);
    }

    let batchIndex = 0;
    let persisted = false; // 标记是否已写入 chat.extra.chatImages

    function processNextBatch() {
        if (batchIndex >= batches.length) return;
        const batch = batches[batchIndex];
        const items = [...batch.items].sort((a, b) => (a.order || 0) - (b.order || 0));
        let itemIndex = 0;

        function showCurrentItem() {
            if (itemIndex >= items.length) {
                batchIndex++;
                processNextBatch();
                return;
            }

            const item = items[itemIndex];
            const imgUrl = getImageUrl(item.image);
            if (!imgUrl) {
                itemIndex++;
                showCurrentItem();
                return;
            }

            if (container.length) {
                container.empty();
                const imageHtml = `
        <div class="mes_media_container mes_img_container chat-image-queued" data-index="${Date.now()}" data-rule-id="${item.ruleId || ''}">
            <div class="mes_img_controls">
                <div title="点击放大" class="right_menu_button fa-lg fa-solid fa-magnifying-glass chat-image-enlarge"></div>
            </div>
            <img class="mes_img" src="${imgUrl}" alt="${escapeHtml(item.image.name || '聊天图片')}" title="${escapeHtml(item.image.name || '聊天图片')}" onerror="chatImagesCleanupStaleImage(this)">
        </div>`;
                container.append(imageHtml);
            }

            // 仅在首次展示时持久化到 chat.extra.chatImages（避免高频 saveChat）
            if (!persisted) {
                const { chat, saveChat } = getContext();
                const msg = chat[messageId];
                if (msg) {
                    if (!msg.extra) msg.extra = {};
                    msg.extra.chatImages = [{ url: imgUrl, name: item.image.name || '聊天图片', filename: item.image.filename }];
                    saveChat();
                    persisted = true;
                }
            }

            itemIndex++;

            // 设置定时器切换到下一项/下一批次
            if (itemIndex < items.length && item.duration > 0) {
                const timer = setTimeout(showCurrentItem, item.duration * 1000);
                imageQueueTimers.set(messageId, timer);
            } else if (itemIndex >= items.length) {
                if (item.duration > 0) {
                    const timer = setTimeout(function () {
                        batchIndex++;
                        processNextBatch();
                    }, item.duration * 1000);
                    imageQueueTimers.set(messageId, timer);
                } else {
                    batchIndex++;
                    setTimeout(processNextBatch, 100);
                }
            }
        }
        showCurrentItem();
    }
    processNextBatch();
}
