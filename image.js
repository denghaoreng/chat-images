// image.js — 图片管理：上传、删除、放大

import { getContext } from '../../../extensions.js';
import { generateId } from './utils.js';
import { getRulesData, saveSettings } from './data.js';

export function getImageUrl(image) {
    if (!image?.path) return '';
    return image.path.startsWith('/') ? image.path : '/' + image.path;
}

export function generateUniqueFilename(originalName) {
    const ext = originalName.split('.').pop();
    const now = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    const dateStr = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
    const rand = Math.floor(1000 + Math.random() * 9000);
    return `chat-images_${dateStr}_${rand}.${ext}`;
}

export async function handleImageUpload(ruleId) {
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = 'image/png,image/jpeg,image/gif,image/webp';

    fileInput.onchange = async function (e) {
        const file = e.target.files[0];
        if (!file) return;

        const allowedTypes = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'];
        if (!allowedTypes.includes(file.type)) {
            toastr.warning('仅支持 PNG、JPEG、GIF、WebP 格式的图片');
            return;
        }

        const filename = generateUniqueFilename(file.name);

        const reader = new FileReader();
        reader.onload = async function (ev) {
            try {
                const base64Data = ev.target.result.split(',')[1] || ev.target.result;
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
                    saveSettings();
                    const ruleEl = $(`.rule-item[data-rule-id="${ruleId}"]`);
                    const imagesContainer = ruleEl.find('.rule-images');
                    if (imagesContainer.length) {
                        // 动态导入避免循环依赖
                        const { renderRuleImages } = await import('./rules-ui.js');
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

export async function handleBatchImageUpload(ruleId) {
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.multiple = true;
    fileInput.accept = 'image/png,image/jpeg,image/gif,image/webp';

    fileInput.onchange = async function (e) {
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
            if (rule) {
                const { renderRuleImages } = await import('./rules-ui.js');
                imagesContainer.html(renderRuleImages(rule));
            }
        }

        if (successCount > 0) toastr.success(`成功上传 ${successCount} 张图片`);
        if (failCount > 0) toastr.warning(`${failCount} 张图片上传失败`);
    };

    fileInput.click();
}

export async function deleteImageFile(image) {
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

export function chatImageEnlarge(imgEl) {
    if (!imgEl?.src) return;
    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;top:0;left:0;width:100vw;height:100vh;height:100dvh;background:rgba(0,0,0,0.9);z-index:99999;display:flex;align-items:center;justify-content:center;cursor:zoom-out;';
    const enlargedImg = document.createElement('img');
    enlargedImg.src = imgEl.src;
    enlargedImg.style.cssText = 'max-width:95vw;max-height:95vh;max-height:95dvh;width:auto;height:auto;object-fit:contain;border-radius:4px;box-shadow:0 0 20px rgba(0,0,0,0.5);';
    enlargedImg.className = 'img_enlarged';
    enlargedImg.addEventListener('click', function (e) { e.stopPropagation(); this.classList.toggle('zoomed'); });
    overlay.appendChild(enlargedImg);
    overlay.addEventListener('click', function () { document.body.removeChild(overlay); });
    document.body.appendChild(overlay);
}
