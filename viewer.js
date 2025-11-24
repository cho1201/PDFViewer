// (PDF 뷰어의 모든 JavaScript 로직)

let tokenClient, gapiInited = false, gisInited = false;
let selectedFile = null, currentFiles = [], currentMemos = [];
let isLeftSidebarCollapsed = false, isRightSidebarCollapsed = true, isMobileMemoOpen = false;
let dataFolderId = null;

const SCOPES = 'https://www.googleapis.com/auth/drive.readonly https://www.googleapis.com/auth/drive.file';
const DISCOVERY_DOCS = ['https://www.googleapis.com/discovery/v1/apis/drive/v3/rest'];
const els = {};

lucide.createIcons();
initDOMElements();
checkGoogleLibs();

els.loginBtn.addEventListener('click', handleLogin);
els.logoutBtn.addEventListener('click', handleLogout);
els.mobileLogoutBtn.addEventListener('click', handleLogout);

els.toggleSidebarLBtn.addEventListener('click', () => togglePcSidebar('left'));
els.toggleMemoBtn.addEventListener('click', () => togglePcSidebar('right'));

els.mobileToggleMemoBtn.addEventListener('click', toggleMobileMemo);
els.closeMobileMemoBtn.addEventListener('click', toggleMobileMemo);

els.backToListBtn.addEventListener('click', () => {
    els.viewerArea.classList.add('translate-x-full');
    els.viewerArea.classList.remove('fixed', 'inset-0', 'z-50');
    if (isMobileMemoOpen) toggleMobileMemo();
});

els.mobileSaveMemoBtn.addEventListener('click', () => saveMemoToDrive(true));
els.saveMemoBtn.addEventListener('click', () => saveMemoToDrive(false));

function initDOMElements() {
    [
        'login-screen', 'dashboard-screen', 'login-btn', 'logout-btn', 'mobile-logout-btn',
        'login-error', 'login-error-msg', 'client-id', 'api-key',
        'sidebar-l', 'sidebar-r', 'viewer-area',
        'toggle-sidebar-l-btn', 'toggle-memo-btn',
        'mobile-toggle-memo-btn', 'close-memo-btn', 'back-to-list-btn',
        'file-list', 'status-msg', 'pdf-frame', 'viewer-placeholder',
        'mobile-viewer-title', 'file-count', 'pdf-container',
        'memo-page', 'memo-text', 'save-memo-btn', 'memo-list',
        'memo-loading', 'mobile-memo-panel', 'close-mobile-memo-btn',
        'mobile-memo-page', 'mobile-memo-text', 'mobile-save-memo-btn',
        'mobile-memo-list', 'mobile-memo-loading'
    ].forEach(id => els[toCamelCase(id)] = document.getElementById(id));
}

function toCamelCase(s) {
    return s.replace(/-([a-z])/g, (g) => g[1].toUpperCase());
}

function checkGoogleLibs() {
    if (window.gapi) gapiInited = true;
    if (window.google && window.google.accounts) gisInited = true;
    if (gapiInited && gisInited) els.loginBtn.disabled = false;
    else setTimeout(checkGoogleLibs, 500);
}

async function handleLogin() {
    const clientId = els.clientId.value.trim();
    const apiKey = els.apiKey.value.trim();

    if (!clientId || !apiKey) return showLoginError('정보를 모두 입력해주세요.');

    hideLoginError();
    setLoading(true);

    try {
        await new Promise(r => gapi.load('client', r));
        await gapi.client.init({ apiKey, discoveryDocs: DISCOVERY_DOCS });

        tokenClient = google.accounts.oauth2.initTokenClient({
            client_id: clientId,
            scope: SCOPES,
            callback: async (r) => {
                if (r.error) throw r;
                els.loginScreen.classList.add('hidden');
                els.dashboardScreen.classList.remove('hidden');
                await ensureDataFolder();
                fetchPDFFiles();
            }
        });
        tokenClient.requestAccessToken({ prompt: '' });

    } catch (e) {
        console.error(e);
        showLoginError('로그인 실패');
        setLoading(false);
    }
}

async function ensureDataFolder() {
    try {
        const res = await gapi.client.drive.files.list({
            q: "mimeType='application/vnd.google-apps.folder' and name='viewer_data' and trashed=false",
            fields: 'files(id)'
        });

        dataFolderId = res.result.files.length
            ? res.result.files[0].id
            : (await gapi.client.drive.files.create({
                resource: {
                    name: 'viewer_data',
                    mimeType: 'application/vnd.google-apps.folder'
                },
                fields: 'id'
            })).result.id;

    } catch (e) {
        alert('데이터 폴더 오류');
    }
}

async function loadMemosFromDrive(fileId) {
    if (!fileId || !dataFolderId) return;

    showMemoLoading(true);

    try {
        const res = await gapi.client.drive.files.list({
            q: `'${dataFolderId}' in parents and name='${fileId}.json' and trashed=false`,
            fields: 'files(id)'
        });

        currentMemos = res.result.files.length
            ? JSON.parse((await gapi.client.drive.files.get({
                fileId: res.result.files[0].id,
                alt: 'media'
            })).body)
            : [];

        renderAllMemoLists();

    } catch (e) {
        console.error(e);
        currentMemos = [];
        renderAllMemoLists();
    } finally {
        showMemoLoading(false);
    }
}

async function saveMemoToDrive(isMobile) {
    if (!selectedFile) return alert('파일 선택 필요');

    const pageInput = isMobile ? els.mobileMemoPage : els.memoPage;
    const textInput = isMobile ? els.mobileMemoText : els.memoText;

    const page = parseInt(pageInput.value);
    const text = textInput.value.trim();

    if (!page || page < 1 || !text) return alert('페이지와 내용을 입력하세요.');

    showMemoLoading(true);

    try {
        const idx = currentMemos.findIndex(m => m.page === page);
        const newMemo = { page, text, updatedAt: new Date().toISOString() };

        if (idx >= 0) currentMemos[idx] = newMemo;
        else currentMemos.push(newMemo);

        currentMemos.sort((a, b) => a.page - b.page);

        const res = await gapi.client.drive.files.list({
            q: `'${dataFolderId}' in parents and name='${selectedFile.id}.json' and trashed=false`,
            fields: 'files(id)'
        });

        const fileId = res.result.files.length ? res.result.files[0].id : null;
        const body = JSON.stringify(currentMemos);

        if (fileId) {
            await gapi.client.request({
                path: `/upload/drive/v3/files/${fileId}`,
                method: 'PATCH',
                params: { uploadType: 'media' },
                body
            });
        } else {
            const form = new FormData();
            form.append('metadata', new Blob(
                [JSON.stringify({
                    name: `${selectedFile.id}.json`,
                    parents: [dataFolderId],
                    mimeType: 'application/json'
                })],
                { type: 'application/json' }
            ));
            form.append('file', new Blob([body], { type: 'application/json' }));

            await fetch(
                'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart',
                {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${gapi.client.getToken().access_token}`
                    },
                    body: form
                }
            );
        }

        textInput.value = '';
        renderAllMemoLists();

    } catch (e) {
        alert('저장 실패');
    } finally {
        showMemoLoading(false);
    }
}

async function deleteMemo(page) {
    if (!confirm('삭제하시겠습니까?')) return;

    showMemoLoading(true);

    try {
        currentMemos = currentMemos.filter(m => m.page !== page);

        const res = await gapi.client.drive.files.list({
            q: `'${dataFolderId}' in parents and name='${selectedFile.id}.json' and trashed=false`,
            fields: 'files(id)'
        });

        if (res.result.files.length) {
            await gapi.client.request({
                path: `/upload/drive/v3/files/${res.result.files[0].id}`,
                method: 'PATCH',
                params: { uploadType: 'media' },
                body: JSON.stringify(currentMemos)
            });
        }

        renderAllMemoLists();

    } catch (e) {
        alert('삭제 실패');
    } finally {
        showMemoLoading(false);
    }
}

function togglePcSidebar(side) {
    if (side === 'left') {
        isLeftSidebarCollapsed = !isLeftSidebarCollapsed;
        els.sidebarL.classList.toggle('sidebar-collapsed', isLeftSidebarCollapsed);
    } else {
        isRightSidebarCollapsed = !isRightSidebarCollapsed;
        els.sidebarR.classList.toggle('sidebar-collapsed', isRightSidebarCollapsed);

        if (!isRightSidebarCollapsed) {
            els.sidebarR.classList.remove('translate-x-full');
            if (selectedFile) loadMemosFromDrive(selectedFile.id);
        } else {
            els.sidebarR.classList.add('translate-x-full');
        }
    }
}

function toggleMobileMemo() {
    isMobileMemoOpen = !isMobileMemoOpen;
    els.mobileMemoPanel.classList.toggle('open', isMobileMemoOpen);
    els.viewerArea.classList.toggle('memo-open', isMobileMemoOpen);

    if (isMobileMemoOpen && selectedFile) {
        loadMemosFromDrive(selectedFile.id);
    }
}

async function selectFile(file) {
    selectedFile = file;
    renderFileList(currentFiles);

    els.pdfFrame.src = file.webViewLink.replace('/view', '/preview');
    els.pdfFrame.classList.remove('hidden');
    els.viewerPlaceholder.classList.add('hidden');
    els.toggleMemoBtn.classList.remove('hidden');

    if (!isRightSidebarCollapsed || isMobileMemoOpen)
        await loadMemosFromDrive(file.id);

    if (window.innerWidth < 768) {
        els.mobileViewerTitle.textContent = file.name;
        els.viewerArea.classList.remove('translate-x-full');
        els.viewerArea.classList.add('fixed', 'inset-0', 'z-50');
    }
}

async function fetchPDFFiles() {
    try {
        showStatus('폴더 찾는 중...');

        const fRes = await gapi.client.drive.files.list({
            q: "mimeType='application/vnd.google-apps.folder' and name='viewer' and trashed=false",
            fields: 'files(id)'
        });

        if (!fRes.result.files.length)
            return showStatus("'viewer' 폴더 없음", true);

        showStatus('로딩 중...');

        const filesRes = await gapi.client.drive.files.list({
            q: `'${fRes.result.files[0].id}' in parents and mimeType='application/pdf' and trashed=false`,
            fields: 'files(id, name, webViewLink, createdTime)',
            orderBy: 'name desc'
        });

        currentFiles = filesRes.result.files;
        renderFileList(currentFiles);
        els.fileCount.textContent = `${currentFiles.length}개`;

        hideStatus();

    } catch (e) {
        showStatus('로드 실패', true);
    }
}

function renderAllMemoLists() {
    renderMemoList(els.memoList, false);
    renderMemoList(els.mobileMemoList, true);
}

function renderMemoList(container, isMobile) {
    container.innerHTML = '';

    if (!currentMemos.length) {
        container.innerHTML =
            '<div class="text-center text-gray-400 py-4 text-sm">메모 없음</div>';
        return;
    }

    currentMemos.forEach(m => {
        const div = document.createElement('div');
        div.className =
            'bg-white p-3 rounded-lg border shadow-sm relative group';

        div.innerHTML = `
            <div class="flex justify-between mb-1">
                <span class="bg-green-100 text-green-800 text-xs font-bold px-2 py-0.5 rounded-full">P.${m.page}</span>
                <span class="text-xs text-gray-400">${new Date(m.updatedAt).toLocaleDateString()}</span>
            </div>
            <p class="text-sm whitespace-pre-wrap">${m.text}</p>
            <button class="del-btn absolute top-2 right-2 text-gray-300 hover:text-red-500 ${isMobile ? '' : 'opacity-0 group-hover:opacity-100'} transition-opacity">
                <i data-lucide="trash-2" class="w-4 h-4"></i>
            </button>
        `;

        div.querySelector('.del-btn').onclick = (e) => {
            e.stopPropagation();
            deleteMemo(m.page);
        };

        div.onclick = (e) => {
            if (!e.target.closest('.del-btn')) {
                (isMobile ? els.mobileMemoPage : els.memoPage).value = m.page;
                (isMobile ? els.mobileMemoText : els.memoText).value = m.text;
            }
        };

        container.appendChild(div);
    });

    lucide.createIcons();
}

function renderFileList(files) {
    els.fileList.innerHTML = '';

    files.forEach(f => {
        const div = document.createElement('div');
        div.className =
            `w-full p-3 rounded-xl flex items-center gap-3 border cursor-pointer ${
                selectedFile?.id === f.id
                    ? 'bg-green-50 border-green-200'
                    : 'bg-white border-transparent hover:bg-gray-50'
            }`;

        div.innerHTML = `
            <div class="p-2 rounded-lg ${
                selectedFile?.id === f.id
                    ? 'bg-green-100 text-green-600'
                    : 'bg-gray-100 text-gray-500'
            }">
                <i data-lucide="file-text" class="w-5 h-5"></i>
            </div>
            <div class="min-w-0 flex-1">
                <p class="truncate font-medium ${
                    selectedFile?.id === f.id ? 'text-green-700' : 'text-gray-700'
                }">${f.name}</p>
                <p class="text-xs text-gray-400">
                    ${new Date(f.createdTime).toLocaleDateString()}
                </p>
            </div>
        `;

        div.onclick = () => selectFile(f);

        els.fileList.appendChild(div);
    });

    lucide.createIcons();
}

function handleLogout() {
    if (gapi.client.getToken())
        google.accounts.oauth2.revoke(gapi.client.getToken().access_token, () => {});

    gapi.client.setToken('');

    els.dashboardScreen.classList.add('hidden');
    els.loginScreen.classList.remove('hidden');

    els.clientId.value = '';
    els.apiKey.value = '';
    selectedFile = null;
}

function showLoginError(m) {
    els.loginErrorMsg.textContent = m;
    els.loginError.classList.remove('hidden');
}

function hideLoginError() {
    els.loginError.classList.add('hidden');
}

function setLoading(l) {
    els.loginBtn.disabled = l;
    els.loginBtn.innerText = l ? '연결 중...' : 'Google 계정으로 시작하기';
}

function showStatus(m, e = false) {
    els.statusMsg.textContent = m;
    els.statusMsg.className =
        `p-4 text-center border-b ${
            e ? 'text-red-600 bg-red-50' : 'text-gray-500 bg-gray-50 animate-pulse'
        }`;
}

function hideStatus() {
    els.statusMsg.classList.add('hidden');
}

function showMemoLoading(l) {
    els.memoLoading.classList.toggle('hidden', !l);
    els.mobileMemoLoading.classList.toggle('hidden', !l);
}

