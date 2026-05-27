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
    // 不使用 accept 属性，避免 Android 强制打开相册而非文件管理器
    const fileInput = document.createElement('input');
    fileInput.type = 'file';

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
    // 不使用 accept 属性，避免 Android 强制打开相册
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.multiple = true;

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

    // 创建遮罩层
    const overlay = document.createElement('div');
    overlay.className = 'chat-images-enlarge-overlay';
    overlay.style.cssText = 'position:fixed;top:0;left:0;width:100vw;height:100vh;height:100dvh;background:rgba(0,0,0,0.9);z-index:99999;display:flex;align-items:center;justify-content:center;overflow:hidden;touch-action:none;';

    // 图片容器（用于缩放平移）
    const imgContainer = document.createElement('div');
    imgContainer.style.cssText = 'position:relative;display:flex;align-items:center;justify-content:center;width:100%;height:100%;overflow:hidden;touch-action:none;';

    const enlargedImg = document.createElement('img');
    enlargedImg.src = imgEl.src;
    enlargedImg.className = 'chat-images-enlarged';
    enlargedImg.style.cssText = 'max-width:95vw;max-height:95vh;max-height:95dvh;width:auto;height:auto;object-fit:contain;border-radius:4px;box-shadow:0 0 20px rgba(0,0,0,0.5);touch-action:none;user-select:none;-webkit-user-drag:none;transform-origin:center center;transition:transform 0.05s ease;';

    // 缩放平移状态
    let scale = 1;
    let minScale = 1;
    let translateX = 0;
    let translateY = 0;
    let lastDist = 0;
    let lastTouchX = 0;
    let lastTouchY = 0;
    let isPinching = false;
    let isPanning = false;

    // 应用变换
    function applyTransform() {
        enlargedImg.style.transform = `translate(${translateX}px, ${translateY}px) scale(${scale})`;
    }

    // 计算两点距离（用于捏合）
    function getDistance(touches) {
        if (touches.length < 2) return 0;
        const dx = touches[0].clientX - touches[1].clientX;
        const dy = touches[0].clientY - touches[1].clientY;
        return Math.sqrt(dx * dx + dy * dy);
    }

    // 计算两点中心
    function getCenter(touches) {
        if (touches.length < 2) return { x: 0, y: 0 };
        return {
            x: (touches[0].clientX + touches[1].clientX) / 2,
            y: (touches[0].clientY + touches[1].clientY) / 2,
        };
    }

    // 触摸开始
    imgContainer.addEventListener('touchstart', function (e) {
        if (e.touches.length >= 2) {
            e.preventDefault();
            isPinching = true;
            isPanning = false;
            lastDist = getDistance(e.touches);
            enlargedImg.style.transition = 'none';
        } else if (e.touches.length === 1) {
            if (scale > 1) {
                isPanning = true;
                lastTouchX = e.touches[0].clientX;
                lastTouchY = e.touches[0].clientY;
                enlargedImg.style.transition = 'none';
            }
        }
    }, { passive: false });

    // 触摸移动
    imgContainer.addEventListener('touchmove', function (e) {
        if (e.touches.length >= 2 && isPinching) {
            e.preventDefault();
            const dist = getDistance(e.touches);
            const newScale = scale * (dist / lastDist);
            scale = Math.max(minScale, Math.min(newScale, 6));
            lastDist = dist;
            applyTransform();
        } else if (e.touches.length === 1 && isPanning) {
            e.preventDefault();
            const dx = e.touches[0].clientX - lastTouchX;
            const dy = e.touches[0].clientY - lastTouchY;
            translateX += dx;
            translateY += dy;
            lastTouchX = e.touches[0].clientX;
            lastTouchY = e.touches[0].clientY;
            applyTransform();
        }
    }, { passive: false });

    // 触摸结束
    imgContainer.addEventListener('touchend', function (e) {
        if (e.touches.length < 2) {
            isPinching = false;
            enlargedImg.style.transition = 'transform 0.2s ease';
            // 如果缩回原始大小，也重置位置
            if (scale <= minScale) {
                scale = minScale;
                translateX = 0;
                translateY = 0;
                applyTransform();
            }
            // 双击检测（点击时间 < 400ms 且没有缩放时放大）
            if (e.changedTouches.length === 1 && !isPanning) {
                const now = Date.now();
                const lastTap = enlargedImg._lastTap || 0;
                if (now - lastTap < 400) {
                    if (scale > 1) {
                        scale = 1;
                        translateX = 0;
                        translateY = 0;
                        applyTransform();
                    } else {
                        scale = 2.5;
                        applyTransform();
                    }
                    enlargedImg._lastTap = 0;
                } else {
                    enlargedImg._lastTap = now;
                }
            }
            isPanning = false;
        }
    }, { passive: false });

    // 鼠标滚轮缩放
    imgContainer.addEventListener('wheel', function (e) {
        e.preventDefault();
        const delta = e.deltaY > 0 ? -0.15 : 0.15;
        const newScale = Math.max(minScale, Math.min(scale + delta, 6));
        scale = newScale;
        if (scale <= minScale) {
            translateX = 0;
            translateY = 0;
        }
        enlargedImg.style.transition = 'transform 0.1s ease';
        applyTransform();
    }, { passive: false });

    // 桌面端：点击切换缩放
    enlargedImg.addEventListener('click', function (e) {
        e.stopPropagation();
        if (scale > 1) {
            scale = 1;
            translateX = 0;
            translateY = 0;
        } else {
            scale = 2.5;
        }
        enlargedImg.style.transition = 'transform 0.2s ease';
        applyTransform();
    });

    // 点击遮罩关闭
    overlay.addEventListener('click', function () {
        document.body.removeChild(overlay);
    });

    imgContainer.appendChild(enlargedImg);
    overlay.appendChild(imgContainer);
    document.body.appendChild(overlay);
}
