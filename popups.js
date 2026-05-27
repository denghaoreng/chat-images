// popups.js — 弹窗：正则手册、批量添加规则

import { getContext } from '../../../extensions.js';
import { callGenericPopup, POPUP_TYPE } from '../../../popup.js';
import { getRulesData, addRule, saveSettings } from './data.js';
import { generateUniqueFilename, getImageUrl } from './image.js';
import { generateId } from './utils.js';

// ==================== 正则手册 ====================

export function showRegexHelp() {
    const helpHtml = `
    <style>
        .regex-help-table { width:100%; border-collapse: collapse; margin:6px 0; font-size:0.9em; }
        .regex-help-table th, .regex-help-table td { border:1px solid var(--borderColor); padding:6px 8px; text-align:left; }
        .regex-help-table th { background:var(--white30); font-weight:600; }
        .regex-help-table td:first-child { font-family:monospace; white-space:nowrap; color:var(--primary); font-weight:bold; }
        .regex-help-code { background:var(--white30); padding:1px 5px; border-radius:3px; font-family:monospace; font-size:0.9em; }
        .regex-help-note { background:var(--white15); border-left:3px solid var(--primary); padding:8px 12px; margin:8px 0; border-radius:0 4px 4px 0; font-size:0.88em; }
        .regex-help-title { font-size:1.1em; font-weight:bold; margin:12px 0 6px 0; padding-bottom:4px; border-bottom:1px solid var(--borderColor); }
    </style>
    <div style="padding:4px 8px;font-size:0.92em;line-height:1.6;">
        <p>本插件的正则匹配基于 JavaScript <span class="regex-help-code">RegExp</span> 引擎，匹配时自动添加 <span class="regex-help-code">gi</span> 标志。</p>
        <div class="regex-help-title">📖 基本用法</div>
        <p>在规则的"正则"输入框中输入模式，插件会用它对 AI 回复的文本进行匹配。如果匹配成功，则按权重随机选中一张绑定的图片插入到聊天中。</p>
        <div class="regex-help-note"><strong>💡 示例：</strong>输入 <span class="regex-help-code">微笑|开心|高兴</span>，当 AI 回复中包含"微笑"、"开心"或"高兴"时触发。</div>

        <div class="regex-help-title">🔤 直接量字符</div>
        <table class="regex-help-table">
            <tr><th>模式</th><th>说明</th><th>匹配示例</th></tr>
            <tr><td>hello</td><td>直接匹配字符串 "hello"</td><td>"hello world" ✓</td></tr>
            <tr><td>攻击</td><td>直接匹配中文字符 "攻击"</td><td>"发动攻击" ✓</td></tr>
        </table>

        <div class="regex-help-title">🎯 特殊字符（需要转义）</div>
        <table class="regex-help-table">
            <tr><th>字符</th><th>含义</th><th>转义写法</th></tr>
            <tr><td>.</td><td>匹配任意单个字符</td><td>\\.</td></tr>
            <tr><td>*</td><td>前一个字符重复 0 次或多次</td><td>\\*</td></tr>
            <tr><td>+</td><td>前一个字符重复 1 次或多次</td><td>\\+</td></tr>
            <tr><td>?</td><td>前一个字符出现 0 次或 1 次</td><td>\\?</td></tr>
            <tr><td>{ }</td><td>量词：指定重复次数</td><td>\\{ \\}</td></tr>
            <tr><td>( )</td><td>分组/捕获</td><td>\\( \\)</td></tr>
            <tr><td>[ ]</td><td>字符集</td><td>\\[ \\]</td></tr>
            <tr><td>|</td><td>或</td><td>\\|</td></tr>
            <tr><td>^ $</td><td>开头/结尾断言</td><td>\\^ \\$</td></tr>
            <tr><td>\\</td><td>转义符本身</td><td>\\\\</td></tr>
        </table>

        <div class="regex-help-title">📏 量词</div>
        <table class="regex-help-table">
            <tr><th>模式</th><th>说明</th><th>示例</th></tr>
            <tr><td>*</td><td>0 次或多次</td><td>ab*c → "ac","abc"</td></tr>
            <tr><td>+</td><td>1 次或多次</td><td>ab+c → "abc","abbc"</td></tr>
            <tr><td>?</td><td>0 次或 1 次</td><td>ab?c → "ac","abc"</td></tr>
            <tr><td>{n}</td><td>精确重复 n 次</td><td>a{3} → "aaa"</td></tr>
            <tr><td>{n,}</td><td>至少重复 n 次</td><td>a{2,} → "aa","aaa"...</td></tr>
            <tr><td>{n,m}</td><td>重复 n 到 m 次</td><td>a{2,4} → "aa","aaa","aaaa"</td></tr>
        </table>

        <div class="regex-help-title">🔗 常用特殊模式</div>
        <table class="regex-help-table">
            <tr><th>模式</th><th>说明</th><th>示例</th></tr>
            <tr><td>.</td><td>匹配任意单个字符（除换行）</td><td>h.t → "hat","hot"</td></tr>
            <tr><td>\\d</td><td>匹配一个数字</td><td>\\d{3} → "123"</td></tr>
            <tr><td>\\w</td><td>匹配字母/数字/下划线</td><td>\\w+ → "hello_123"</td></tr>
            <tr><td>\\s</td><td>匹配空白字符</td><td>—</td></tr>
        </table>

        <div class="regex-help-title">🎭 字符集</div>
        <table class="regex-help-table">
            <tr><th>模式</th><th>说明</th><th>示例</th></tr>
            <tr><td>[abc]</td><td>匹配 a/b/c 中的任意一个</td><td>b[ae]t → "bat","bet"</td></tr>
            <tr><td>[a-z]</td><td>匹配 a 到 z 的小写字母</td><td>[a-z]+ → "hello"</td></tr>
            <tr><td>[0-9]</td><td>匹配任意数字</td><td>[0-9]{2} → "42"</td></tr>
            <tr><td>[^abc]</td><td>取反</td><td>[^0-9] → 匹配非数字</td></tr>
            <tr><td>[\\u4e00-\\u9fff]</td><td>匹配汉字</td><td>→ "你好世界"</td></tr>
        </table>

        <div class="regex-help-title">🔀 分组与逻辑</div>
        <table class="regex-help-table">
            <tr><th>模式</th><th>说明</th><th>示例</th></tr>
            <tr><td>AB|CD</td><td>或：匹配 AB 或 CD</td><td>攻击|防守</td></tr>
            <tr><td>(abc)</td><td>分组</td><td>(哈){3} → "哈哈哈"</td></tr>
        </table>

        <div class="regex-help-title">📍 位置断言</div>
        <table class="regex-help-table">
            <tr><th>模式</th><th>说明</th><th>示例</th></tr>
            <tr><td>^</td><td>字符串开头</td><td>^你好 → 以"你好"开头</td></tr>
            <tr><td>$</td><td>字符串结尾</td><td>再见$ → 以"再见"结尾</td></tr>
        </table>

        <div class="regex-help-title">💡 实用示例</div>
        <table class="regex-help-table">
            <tr><th>目的</th><th>正则模式</th></tr>
            <tr><td>匹配表情</td><td>微笑|开心|大笑|笑了</td></tr>
            <tr><td>匹配数字</td><td>\\d+</td></tr>
            <tr><td>匹配动作描写</td><td>\\*[^*]+\\*</td></tr>
            <tr><td>匹配问候语</td><td>^(你好|嗨|hello|hi)</td></tr>
            <tr><td>匹配汉字</td><td>[\\u4e00-\\u9fff]+</td></tr>
            <tr><td>匹配重复语气词</td><td>(哈|啊|嗯){2,}</td></tr>
        </table>

        <div class="regex-help-title">⚠️ 注意事项</div>
        <ul style="margin:4px 0;padding-left:18px;">
            <li>匹配是<strong>大小写不敏感</strong>的（自动添加 <span class="regex-help-code">i</span> 标志）</li>
            <li>匹配是<strong>全局</strong>的（自动添加 <span class="regex-help-code">g</span> 标志）</li>
            <li>不要输入定界符 <span class="regex-help-code">/</span>，直接写模式即可</li>
            <li>支持 Unicode 中文匹配</li>
            <li>特殊字符需要加 <span class="regex-help-code">\\</span> 转义</li>
        </ul>
    </div>`;

    callGenericPopup(helpHtml, POPUP_TYPE.TEXT, '', {
        okButton: '关闭',
        wide: true,
        large: true,
        allowVerticalScrolling: true,
    });
}

// ==================== 批量添加规则 ====================

export async function showBatchAddPopup() {
    const setId = $('#chat-images-ruleset-select').val();
    if (!setId || setId === '__unbound') {
        toastr.warning('请先选择一个规则集');
        return;
    }

    const rulesData = getRulesData();
    const setRules = rulesData.rules.filter(r => r.ruleSetId === setId);
    const maxOrder = setRules.reduce((max, r) => Math.max(max, r.order || 0), 0);
    let nextOrder = maxOrder + 1;

    /** @type {Array<{file: File, dataUrl: string, weight: number}>} */
    let uploadedImages = [];

    const popupContent = $(`
    <div id="chat-images-batch-popup" style="font-size:0.92em;">
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
        allowVerticalScrolling: true,
    });

    // 上传按钮
    $('#batch-upload-btn').on('click', function () {
        const input = document.createElement('input');
        input.type = 'file';
        input.multiple = true;
        input.accept = 'image/png,image/jpeg,image/gif,image/webp';
        input.onchange = function (e) {
            const files = Array.from(e.target.files);
            const allowedTypes = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'];
            for (const file of files) {
                if (!allowedTypes.includes(file.type)) continue;
                const reader = new FileReader();
                reader.onload = function (ev) {
                    uploadedImages.push({ file, dataUrl: ev.target.result, weight: 100 });
                    renderBatchThumbs();
                };
                reader.readAsDataURL(file);
            }
        };
        input.click();
    });

    // 实时追踪表单值
    let formPrefix = '批量规则';
    let formRegex = '';
    let formDuration = 2;
    $(document).on('input', '#batch-rule-prefix', function () { formPrefix = String($(this).val() || '').trim() || '批量规则'; });
    $(document).on('input', '#batch-rule-regex', function () { formRegex = String($(this).val() || '').trim(); });
    $(document).on('input', '#batch-rule-duration', function () { formDuration = parseFloat($(this).val()) || 2; });

    // 权重滑条
    $(document).on('input', '.batch-thumb-weight', function () {
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
            thumb.find('.batch-thumb-del').on('click', function () {
                uploadedImages.splice(index, 1);
                renderBatchThumbs();
            });
            container.append(thumb);
        });
    }

    const result = await popup;

    if (result === null || result === undefined || result === false || result === 0) {
        return;
    }

    if (uploadedImages.length === 0) {
        toastr.warning('请至少上传一张图片');
        return;
    }

    let successCount = 0;
    let failCount = 0;

    for (let i = 0; i < uploadedImages.length; i++) {
        const item = uploadedImages[i];
        const ruleName = `${formPrefix}${nextOrder + i}`;

        try {
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
        const { renderRuleList } = await import('./rules-ui.js');
        renderRuleList();
    }
    if (failCount > 0) toastr.warning(`${failCount} 条规则创建失败`);
}
