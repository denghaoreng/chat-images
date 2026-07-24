// utils.js — 工具函数

/** 生成唯一ID：年月日时分秒+4位随机数 */
export function generateId(prefix) {
    const now = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    const ts = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
    const rand = Math.floor(1000 + Math.random() * 9000);
    return `${prefix}_${ts}_${rand}`;
}

export function escapeHtml(text) {
    if (!text) return '';
    return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}

/** 将十六进制颜色 #rrggbb 转换为 "r, g, b" 格式 */
export function hexToRgb(hex) {
    if (!hex || typeof hex !== 'string') return '240, 228, 228';
    hex = hex.replace('#', '');
    if (hex.length !== 6) return '240, 228, 228';
    const r = parseInt(hex.substring(0, 2), 16);
    const g = parseInt(hex.substring(2, 4), 16);
    const b = parseInt(hex.substring(4, 6), 16);
    if (isNaN(r) || isNaN(g) || isNaN(b)) return '240, 228, 228';
    return `${r}, ${g}, ${b}`;
}
