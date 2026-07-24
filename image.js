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
                    weight: 50,
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
                    weight: 50,
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
    overlay.style.cssText = 'position:fixed;top:0;left:0;width:100vw;height:100vh;height:100dvh;background:rgba(0,0,0,0.9);z-index:99999;display:flex;align-items:center;justify-content:center;overflow:hidden;touch-action:none;cursor:pointer;';

    // 图片容器（用于缩放平移）
    const imgContainer = document.createElement('div');
    imgContainer.style.cssText = 'position:relative;display:flex;align-items:center;justify-content:center;width:100%;height:100%;overflow:hidden;touch-action:none;';

    const enlargedImg = document.createElement('img');
    enlargedImg.src = imgEl.src;
    enlargedImg.className = 'chat-images-enlarged';
    enlargedImg.style.cssText = 'max-width:95vw;max-height:95vh;max-height:95dvh;width:auto;height:auto;object-fit:contain;border-radius:4px;box-shadow:0 0 20px rgba(0,0,0,0.5);touch-action:none;user-select:none;-webkit-user-drag:none;transform-origin:center center;transition:transform 0.05s ease;pointer-events:none;';

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

    function applyTransform() {
        enlargedImg.style.transform = `translate(${translateX}px, ${translateY}px) scale(${scale})`;
    }

    function getDistance(touches) {
        if (touches.length < 2) return 0;
        const dx = touches[0].clientX - touches[1].clientX;
        const dy = touches[0].clientY - touches[1].clientY;
        return Math.sqrt(dx * dx + dy * dy);
    }

    function resetView(animate = true) {
        scale = 1;
        translateX = 0;
        translateY = 0;
        enlargedImg.style.transition = animate ? 'transform 0.2s ease' : 'none';
        applyTransform();
    }

    // ---- 鼠标滚轮缩放 ----
    imgContainer.addEventListener('wheel', function (e) {
        e.preventDefault();
        const delta = e.deltaY > 0 ? -0.15 : 0.15;
        const newScale = Math.max(minScale, Math.min(scale + delta, 6));
        scale = newScale;
        if (scale <= minScale) resetView();
        else {
            enlargedImg.style.transition = 'transform 0.1s ease';
            applyTransform();
        }
    }, { passive: false });

    // ---- 桌面端双击切换缩放 ----
    let lastClickTime = 0;
    imgContainer.addEventListener('click', function (e) {
        if (e.target !== imgContainer) return;
        const now = Date.now();
        if (now - lastClickTime < 400) {
            if (scale > 1) resetView();
            else { scale = 2.5; enlargedImg.style.transition = 'transform 0.2s ease'; applyTransform(); }
            lastClickTime = 0;
        } else {
            lastClickTime = now;
        }
    });

    // ---- 移动端触摸支持（捏合/拖拽/双击） ----
    imgContainer.addEventListener('touchstart', function (e) {
        if (e.touches.length >= 2) {
            e.preventDefault();
            isPinching = true;
            isPanning = false;
            lastDist = getDistance(e.touches);
            enlargedImg.style.transition = 'none';
        } else if (e.touches.length === 1 && scale > 1) {
            isPanning = true;
            lastTouchX = e.touches[0].clientX;
            lastTouchY = e.touches[0].clientY;
            enlargedImg.style.transition = 'none';
        }
    }, { passive: false });

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
            translateX += e.touches[0].clientX - lastTouchX;
            translateY += e.touches[0].clientY - lastTouchY;
            lastTouchX = e.touches[0].clientX;
            lastTouchY = e.touches[0].clientY;
            applyTransform();
        }
    }, { passive: false });

    imgContainer.addEventListener('touchend', function (e) {
        if (e.touches.length < 2) {
            isPinching = false;
            enlargedImg.style.transition = 'transform 0.2s ease';
            if (scale <= minScale) resetView();

            if (e.changedTouches.length === 1 && !isPanning) {
                const now = Date.now();
                const lastTap = enlargedImg._lastTap || 0;
                if (now - lastTap < 400) {
                    if (scale > 1) resetView();
                    else { scale = 2.5; applyTransform(); }
                    enlargedImg._lastTap = 0;
                } else {
                    enlargedImg._lastTap = now;
                }
            }
            isPanning = false;
        }
    }, { passive: false });

    // ---- 关闭按钮 ----
    const closeBtn = document.createElement('div');
    closeBtn.innerHTML = '✕';
    closeBtn.style.cssText = 'position:fixed;top:16px;right:16px;width:36px;height:36px;border-radius:50%;background:rgba(0,0,0,0.5);color:white;font-size:18px;display:flex;align-items:center;justify-content:center;cursor:pointer;z-index:100001;user-select:none;line-height:1;';
    closeBtn.title = '关闭 (Esc)';
    ['mousedown', 'mouseup', 'click', 'touchstart', 'touchend'].forEach(function (evt) {
        closeBtn.addEventListener(evt, function (e) { e.stopPropagation(); });
    });
    closeBtn.addEventListener('click', function () { closeOverlay(); });
    document.body.appendChild(closeBtn);

    // ---- 捕获层拦截 ----
    var isInsideOverlay = function (el) {
        return el && (el === overlay || el === closeBtn || overlay.contains(el) || closeBtn.contains(el));
    };
    var overlayGuard = function (e) {
        if (!isInsideOverlay(e.target)) e.stopPropagation();
    };
    document.addEventListener('mousedown', overlayGuard, true);
    document.addEventListener('mouseup', overlayGuard, true);
    document.addEventListener('click', overlayGuard, true);
    document.addEventListener('touchstart', overlayGuard, true);
    document.addEventListener('touchend', overlayGuard, true);

    // ---- 遮罩层阻止事件冒泡 ----
    overlay.addEventListener('mousedown', function (e) { e.stopPropagation(); });
    overlay.addEventListener('mouseup', function (e) { e.stopPropagation(); });
    overlay.addEventListener('touchstart', function (e) { e.stopPropagation(); });
    overlay.addEventListener('touchend', function (e) { e.stopPropagation(); });

    // ---- 点击遮罩层空白区关闭 ----
    overlay.addEventListener('click', function (e) {
        if (e.target === overlay) {
            e.stopPropagation();
            closeOverlay();
        }
    });

    // ---- 图片容器阻止事件冒泡（未缩放时） ----
    imgContainer.addEventListener('mousedown', function (e) { if (scale <= 1) e.stopPropagation(); });
    imgContainer.addEventListener('mouseup', function (e) { if (scale <= 1) e.stopPropagation(); });
    imgContainer.addEventListener('touchstart', function (e) { if (scale <= 1) e.stopPropagation(); });
    imgContainer.addEventListener('touchend', function (e) { if (scale <= 1) e.stopPropagation(); });

    // ---- 未缩放时点击容器空白区关闭 ----
    imgContainer.addEventListener('click', function (e) {
        if (e.target !== imgContainer) return;
        if (scale <= 1) {
            e.stopPropagation();
            closeOverlay();
        }
    });

    // ---- 键盘 Esc 关闭 ----
    function onKeyDown(e) { if (e.key === 'Escape') closeOverlay(); }
    window.addEventListener('keydown', onKeyDown);

    var allEvents = ['mousedown', 'mouseup', 'click', 'touchstart', 'touchend'];

    function closeOverlay() {
        window.removeEventListener('keydown', onKeyDown);
        document.removeEventListener('mousedown', overlayGuard, true);
        document.removeEventListener('mouseup', overlayGuard, true);
        document.removeEventListener('click', overlayGuard, true);
        document.removeEventListener('touchstart', overlayGuard, true);
        document.removeEventListener('touchend', overlayGuard, true);

        // 闭锁守卫：吸收重派发的事件
        var closeGuard = function (e) { e.stopPropagation(); e.preventDefault(); };
        allEvents.forEach(function (evt) { document.addEventListener(evt, closeGuard, true); });

        overlay.style.display = 'none';
        closeBtn.style.display = 'none';
        try { if (overlay.parentNode) document.body.removeChild(overlay); } catch (e) {}
        try { if (closeBtn.parentNode) document.body.removeChild(closeBtn); } catch (e) {}

        requestAnimationFrame(function () {
            allEvents.forEach(function (evt) { document.removeEventListener(evt, closeGuard, true); });
        });
    }

    imgContainer.appendChild(enlargedImg);
    overlay.appendChild(imgContainer);
    document.body.appendChild(overlay);
}
