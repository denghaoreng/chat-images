// rules-ui.js — 规则界面：渲染、事件绑定

import { getContext } from '../../../extensions.js';
import { getRulesData, getRuleSets, getCharSets, getRuleById, addRule, updateRule, deleteRule, updateRuleSet, deleteRuleSet, addRuleSet, updateCharSet, deleteCharSet, addCharSet, saveSettings, currentSettings } from './data.js';
import { getImageUrl, handleImageUpload, handleBatchImageUpload, deleteImageFile } from './image.js';
import { showRegexHelp, showBatchAddPopup } from './popups.js';
import { escapeHtml } from './utils.js';

// ==================== 规则渲染 ====================

export function renderRuleList() {
    const container = $('#chat-images-rule-list');
    container.empty();

    const rulesData = getRulesData();
    const searchTerm = ($('#chat-images-search').val() || '').trim().toLowerCase();
    const selectedSetId = $('#chat-images-ruleset-select').val() || '';

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

    const searched = searchTerm
        ? filtered.filter(r => r.name.toLowerCase().includes(searchTerm))
        : filtered;

    const sortBy = $('#chat-images-sort').val() || 'order';
    searched.sort(function (a, b) {
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
                        <div class="rule-add-image mes_button fa-solid fa-paperclip" data-rule-id="${rule.id}" title="上传图片" tabindex="0" role="button"></div>
                        <div class="rule-add-images-batch mes_button fa-solid fa-images" data-rule-id="${rule.id}" title="批量上传图片" tabindex="0" role="button"></div>
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

export function renderRuleImages(rule) {
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

export function renderRuleSetList() {
    const container = $('#chat-images-ruleset-list');
    container.empty();
    let ruleSets = getRuleSets();

    const selectedCharId = $('#chat-images-ruleset-charselect').val() || '';
    if (selectedCharId === '__unbound') {
        ruleSets = ruleSets.filter(rs => !rs.charSetId);
    } else if (selectedCharId) {
        ruleSets = ruleSets.filter(rs => rs.charSetId === selectedCharId);
    }

    const searchTerm = ($('#chat-images-ruleset-search').val() || '').trim().toLowerCase();
    if (searchTerm) {
        ruleSets = ruleSets.filter(rs => rs.name.toLowerCase().includes(searchTerm));
    }

    const sortBy = $('#chat-images-ruleset-sort').val() || 'order';
    ruleSets.sort(function (a, b) {
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

export function bindRuleSetEvents(element, rs) {
    element.find('.ruleset-name').on('input', function () {
        updateRuleSet(rs.id, { name: $(this).val() });
        populateRuleSetDropdown();
    });
    element.find('.ruleset-order').on('input', function () {
        updateRuleSet(rs.id, { order: parseFloat($(this).val()) || 0 });
    });
    element.find('.ruleset-enabled').on('change', function () {
        updateRuleSet(rs.id, { enabled: $(this).is(':checked') });
    });
    element.find('.ruleset-delete').on('click', function () {
        if (confirm(`确定删除规则集 "${rs.name}" 吗？关联的规则将变为未分组。`)) {
            deleteRuleSet(rs.id);
            renderRuleSetList();
            populateRuleSetDropdown();
        }
    });
    element.find('.ruleset-edit').on('click', function () {
        window.lastActiveTab = 'rules';
        $('#chat-images-rules-panel').show();
        $('#chat-images-rulesets-panel').hide();
        $('.chat-images-tab[data-tab="rules"]').addClass('chat-images-tab-active').css('border-bottom', '2px solid var(--primary)').css('color', '');
        $('.chat-images-tab[data-tab="rulesets"]').removeClass('chat-images-tab-active').css('border-bottom', '2px solid transparent').css('color', 'var(--grey40)');
        $('#chat-images-ruleset-select').val(rs.id);
        renderRuleList();
        updateAddButtons();
    });
}

// ==================== 角色集渲染 ====================

export function renderCharSetList() {
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

export function bindCharSetEvents(element, cs) {
    element.find('.charset-name').on('input', function () {
        updateCharSet(cs.id, { name: $(this).val() });
        populateRuleSetCharDropdown();
    });
    element.find('.charset-enabled').on('change', function () {
        updateCharSet(cs.id, { enabled: $(this).is(':checked') });
        renderCharSetList();
    });
    element.find('.charset-delete').on('click', function () {
        if (confirm(`确定删除角色图片集 "${cs.name}" 吗？`)) {
            deleteCharSet(cs.id);
            renderCharSetList();
            populateRuleSetCharDropdown();
        }
    });
    element.find('.charset-edit').on('click', function () {
        window.lastActiveTab = 'rulesets';
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

// ==================== 下拉框填充 ====================

export function populateRuleSetDropdown() {
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

export function populateRuleSetCharDropdown() {
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

// ==================== 规则事件绑定 ====================

export function bindRuleEvents(ruleElement, rule) {
    ruleElement.find('.rule-name').on('input', function () {
        updateRule(rule.id, { name: $(this).val() });
    });
    ruleElement.find('.rule-order').on('input', function () {
        updateRule(rule.id, { order: parseFloat($(this).val()) || 0 });
    });
    ruleElement.find('.rule-duration').on('input', function () {
        updateRule(rule.id, { duration: parseFloat($(this).val()) || 0 });
    });
    ruleElement.find('.rule-regex').on('input', function () {
        updateRule(rule.id, { regex: $(this).val() });
    });
    ruleElement.find('.rule-enabled').on('change', function () {
        updateRule(rule.id, { enabled: $(this).is(':checked') });
    });
    ruleElement.find('.rule-collapse-btn').on('click', function () {
        const collapsible = ruleElement.find('.rule-collapsible');
        const isCollapsed = collapsible.hasClass('collapsed');
        collapsible.toggleClass('collapsed');
        $(this).toggleClass('fa-chevron-down fa-chevron-right');
        updateRule(rule.id, { _expanded: isCollapsed });
    });
    ruleElement.find('.rule-delete').on('click', function () {
        if (confirm(`确定删除规则 "${rule.name}" 吗？`)) {
            deleteRule(rule.id);
            renderRuleList();
        }
    });
    ruleElement.find('.rule-add-image').on('click', function () {
        handleImageUpload(rule.id);
    });
    ruleElement.find('.rule-add-images-batch').on('click', function () {
        handleBatchImageUpload(rule.id);
    });
    ruleElement.find('.rule-regex-help').on('click', function () {
        showRegexHelp();
    });
    ruleElement.on('input', '.image-weight-slider', function () {
        const imageId = $(this).data('image-id');
        const value = parseInt($(this).val());
        $(this).siblings('.image-weight-value').text(value);
        const img = rule.images.find(i => i.id === imageId);
        if (img) {
            img.weight = value;
            saveSettings();
        }
    });
    ruleElement.on('click', '.rule-image-delete', async function () {
        const imageItem = $(this).closest('.rule-image-item');
        const imageId = imageItem.data('image-id');
        const img = rule.images.find(i => i.id === imageId);
        if (img) await deleteImageFile(img);
        rule.images = rule.images.filter(i => i.id !== imageId);
        saveSettings();
        imageItem.remove();
    });
}

// ==================== 设置同步与 UI 事件 ====================

export function applySettingsToUI() {
    const set = currentSettings;
    $('#chat-images-enabled').prop('checked', set.enabled);
    $('#chat-images-auto-detect').prop('checked', set.autoDetect);
    $('#chat-images-show-in-chat').prop('checked', set.showInChat);
}

export function updateAddButtons() {
    const rsVal = $('#chat-images-ruleset-select').val();
    $('#chat-images-add-rule').prop('disabled', !rsVal || rsVal === '__unbound');
    const csVal = $('#chat-images-ruleset-charselect').val();
    $('#chat-images-add-ruleset').prop('disabled', !csVal || csVal === '__unbound');
}

export function bindUIEvents() {
    $(document).off('click', '.chat-images-tab').on('click', '.chat-images-tab', function () {
        const tab = $(this).data('tab');
        window.lastActiveTab = tab;
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

    $(document).off('change', '#chat-images-ruleset-select').on('change', '#chat-images-ruleset-select', function () {
        renderRuleList();
    });
    $(document).off('change', '#chat-images-sort').on('change', '#chat-images-sort', function () {
        renderRuleList();
    });
    $(document).off('input', '#chat-images-search').on('input', '#chat-images-search', function () {
        renderRuleList();
    });

    $(document).off('click', '#chat-images-add-rule').on('click', '#chat-images-add-rule', function () {
        const setId = $('#chat-images-ruleset-select').val() || '';
        const effectiveSetId = (setId === '__unbound') ? '' : setId;
        const rulesData = getRulesData();
        const setRules = rulesData.rules.filter(r => r.ruleSetId === effectiveSetId);
        const maxOrder = setRules.reduce((max, r) => Math.max(max, r.order || 0), 0);
        addRule({ name: '新规则', regex: '', ruleSetId: effectiveSetId, order: maxOrder + 1 });
        renderRuleList();
    });

    $(document).off('click', '#chat-images-batch-add').on('click', '#chat-images-batch-add', function () {
        showBatchAddPopup();
    });

    // 展开/折叠全部
    $(document).off('click', '#chat-images-expand-all').on('click', '#chat-images-expand-all', function () {
        $('#chat-images-rule-list .rule-collapsible').removeClass('collapsed');
        $('#chat-images-rule-list .rule-collapse-btn').removeClass('fa-chevron-right').addClass('fa-chevron-down');
        $('#chat-images-rule-list .rule-item').each(function () {
            const ruleId = $(this).data('rule-id');
            if (ruleId) updateRule(ruleId, { _expanded: true });
        });
    });
    $(document).off('click', '#chat-images-collapse-all').on('click', '#chat-images-collapse-all', function () {
        $('#chat-images-rule-list .rule-collapsible').addClass('collapsed');
        $('#chat-images-rule-list .rule-collapse-btn').removeClass('fa-chevron-down').addClass('fa-chevron-right');
        $('#chat-images-rule-list .rule-item').each(function () {
            const ruleId = $(this).data('rule-id');
            if (ruleId) updateRule(ruleId, { _expanded: false });
        });
    });

    $(document).off('click', '#chat-images-add-ruleset').on('click', '#chat-images-add-ruleset', function () {
        const charId = $('#chat-images-ruleset-charselect').val();
        const setId = (charId && charId !== '__unbound') ? charId : '';
        addRuleSet('新规则集', setId);
        renderRuleSetList();
        populateRuleSetDropdown();
    });
    $(document).off('input', '#chat-images-ruleset-search').on('input', '#chat-images-ruleset-search', function () {
        renderRuleSetList();
    });
    $(document).off('change', '#chat-images-ruleset-sort').on('change', '#chat-images-ruleset-sort', function () {
        renderRuleSetList();
    });
    $(document).off('change', '#chat-images-ruleset-charselect').on('change', '#chat-images-ruleset-charselect', function () {
        renderRuleSetList();
    });

    $(document).off('click', '#chat-images-add-char-set').on('click', '#chat-images-add-char-set', function () {
        addCharSet('新角色图片集');
        renderCharSetList();
        populateRuleSetCharDropdown();
    });
    $(document).off('input', '#chat-images-char-set-search').on('input', '#chat-images-char-set-search', function () {
        renderCharSetList();
    });

    $(document).off('change', '#chat-images-enabled').on('change', '#chat-images-enabled', function () {
        currentSettings.enabled = $(this).is(':checked');
        saveSettings();
    });
    $(document).off('change', '#chat-images-auto-detect').on('change', '#chat-images-auto-detect', function () {
        currentSettings.autoDetect = $(this).is(':checked');
        saveSettings();
    });
    $(document).off('change', '#chat-images-show-in-chat').on('change', '#chat-images-show-in-chat', function () {
        currentSettings.showInChat = $(this).is(':checked');
        saveSettings();
    });
}
