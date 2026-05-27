// data.js — 数据层：设置管理、规则 CRUD、规则集 CRUD、角色集 CRUD

import { getContext } from '../../../extensions.js';
import { generateId } from './utils.js';

export const MODULE_NAME = 'chat-images';

export const defaultSettings = Object.freeze({
    enabled: true,
    autoDetect: true,
    showInChat: true,
    rulesData: {
        version: 1,
        charSets: [],
        ruleSets: [],
        rules: [],
    },
});

/** @type {import('./data.js').Settings} */
export let currentSettings = {};

// ==================== 设置管理 ====================

export function loadSettings() {
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

    migrateOrphanedRules();
}

function migrateOrphanedRules() {
    const rulesData = getRulesData();
    const validSetIds = new Set((rulesData.ruleSets || []).map(s => s.id));
    let changed = false;
    for (let i = rulesData.rules.length - 1; i >= 0; i--) {
        const r = rulesData.rules[i];
        if (r.ruleSetId && !validSetIds.has(r.ruleSetId)) {
            rulesData.rules.splice(i, 1);
            changed = true;
        } else if (!r.ruleSetId && (!r.images || r.images.length === 0) && r.id && !r.id.includes('_20')) {
            rulesData.rules.splice(i, 1);
            changed = true;
        }
    }
    if (changed) saveSettings();
}

export function saveSettings() {
    const { extensionSettings, saveSettingsDebounced } = getContext();
    extensionSettings[MODULE_NAME] = currentSettings;
    saveSettingsDebounced();
}

// ==================== 规则 CRUD ====================

export function getRulesData() {
    return currentSettings.rulesData || { version: 1, rules: [] };
}

export function getEnabledRules() {
    const rulesData = getRulesData();
    const activeSetIds = new Set((rulesData.ruleSets || []).filter(s => s.enabled).map(s => s.id));
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
        return true;
    });
}

export function getRuleById(ruleId) {
    return getRulesData().rules.find(r => r.id === ruleId);
}

export function addRule(rule) {
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

export function updateRule(ruleId, updates) {
    const rulesData = getRulesData();
    const rule = rulesData.rules.find(r => r.id === ruleId);
    if (!rule) return;
    Object.assign(rule, updates);
    saveSettings();
}

export function deleteRule(ruleId) {
    const rulesData = getRulesData();
    const rule = rulesData.rules.find(r => r.id === ruleId);
    if (rule) {
        for (const img of (rule.images || [])) {
            if (img.path) {
                try {
                    const { getRequestHeaders } = SillyTavern.getContext();
                    fetch('/api/files/delete', {
                        method: 'POST',
                        headers: getRequestHeaders(),
                        body: JSON.stringify({ path: img.path.startsWith('/') ? img.path.substring(1) : img.path }),
                    }).catch(function () { });
                } catch (e) { /*ignore*/ }
            }
        }
    }
    rulesData.rules = rulesData.rules.filter(r => r.id !== ruleId);
    saveSettings();
}

export function addImageToRule(ruleId, imageMeta) {
    const rule = getRuleById(ruleId);
    if (!rule) return false;
    rule.images.push(imageMeta);
    saveSettings();
}

export function updateImageWeight(ruleId, imageId, newWeight) {
    const rule = getRuleById(ruleId);
    if (!rule) return false;
    const img = rule.images.find(i => i.id === imageId);
    if (!img) return false;
    img.weight = newWeight;
    saveSettings();
}

export function removeImageFromRule(ruleId, imageId) {
    const rule = getRuleById(ruleId);
    if (!rule) return false;
    rule.images = rule.images.filter(i => i.id !== imageId);
    saveSettings();
}

// ==================== 规则集 CRUD ====================

export function getRuleSets() {
    return getRulesData().ruleSets || [];
}

export function addRuleSet(name, charSetId) {
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

export function updateRuleSet(setId, updates) {
    const rulesData = getRulesData();
    const set = (rulesData.ruleSets || []).find(s => s.id === setId);
    if (!set) return;
    Object.assign(set, updates);
    saveSettings();
}

export function deleteRuleSet(setId) {
    const rulesData = getRulesData();
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
                    }).catch(function () { });
                } catch (e) { /*ignore*/ }
            }
        }
    }
    rulesData.ruleSets = (rulesData.ruleSets || []).filter(s => s.id !== setId);
    rulesData.rules = rulesData.rules.filter(r => r.ruleSetId !== setId);
    saveSettings();
}

// ==================== 角色图片集 CRUD ====================

export function getCharSets() {
    return getRulesData().charSets || [];
}

export function addCharSet(name) {
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

export function updateCharSet(setId, updates) {
    const rulesData = getRulesData();
    const set = (rulesData.charSets || []).find(s => s.id === setId);
    if (!set) return;
    Object.assign(set, updates);
    if (updates.enabled === true) {
        for (const s of (rulesData.charSets || [])) {
            if (s.id !== setId) s.enabled = false;
        }
    }
    saveSettings();
}

export function deleteCharSet(setId) {
    const rulesData = getRulesData();
    const rsToDelete = (rulesData.ruleSets || []).filter(rs => rs.charSetId === setId);
    for (const rs of rsToDelete) {
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
                        }).catch(function () { });
                    } catch (e) { /*ignore*/ }
                }
            }
        }
    }
    const rsIds = new Set(rsToDelete.map(rs => rs.id));
    rulesData.rules = rulesData.rules.filter(r => !rsIds.has(r.ruleSetId));
    rulesData.ruleSets = (rulesData.ruleSets || []).filter(rs => !rsIds.has(rs.id));
    rulesData.charSets = (rulesData.charSets || []).filter(s => s.id !== setId);
    saveSettings();
}
