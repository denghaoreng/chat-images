// drawer.js — 导航栏抽屉

import { renderRuleList, renderRuleSetList, renderCharSetList, populateRuleSetDropdown, populateRuleSetCharDropdown, updateAddButtons } from './rules-ui.js';

export function addNavBarDrawer() {
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
                    <div style="text-align:center;margin:2px 0;display:flex;gap:4px;justify-content:center;">
                        <button id="chat-images-batch-add" class="menu_button" style="font-size:0.85em;flex:1;">
                            <i class="fa-solid fa-layer-group"></i> 批量
                        </button>
                        <button id="chat-images-batch-edit" class="menu_button" style="font-size:0.85em;flex:1;" title="批量修改选中规则集的所有规则">
                            <i class="fa-solid fa-pen-to-square"></i> 批量改
                        </button>
                        <button id="chat-images-expand-all" class="menu_button menu_button_icon" title="展开全部" style="font-size:0.85em;">
                            <i class="fa-solid fa-chevron-down"></i>
                        </button>
                        <button id="chat-images-collapse-all" class="menu_button menu_button_icon" title="折叠全部" style="font-size:0.85em;">
                            <i class="fa-solid fa-chevron-right"></i>
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

    $('#top-settings-holder').append(drawerHtml);
    $('#chat-images-drawer').insertBefore('#user-settings-button');

    $('#chat-images-drawer .drawer-toggle').on('click', async function () {
        const { doNavbarIconClick } = await import('../../../../script.js');
        doNavbarIconClick.call(this);
        if ($('#chat-images-panel').hasClass('openDrawer')) {
            const tab = window.lastActiveTab || 'charsets';
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

    $('#chat-images-close-drawer').on('click', function () {
        $('#chat-images-drawer .drawer-toggle').trigger('click');
    });
}
