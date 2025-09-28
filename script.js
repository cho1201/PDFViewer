// --- 전역 변수 및 DOM 요소 ---
let API_KEY = '';
let CLIENT_ID = '';
const DISCOVERY_DOCS = ["https://www.googleapis.com/discovery/v1/apis/drive/v3/rest"];
const SCOPES = 'https://www.googleapis.com/auth/drive.readonly';

let tokenClient;
let gapiInited = false;
let gisInited = false;

// DOM 요소
const configSection = document.getElementById('config-section');
const mainContent = document.getElementById('main-content');
const saveConfigBtn = document.getElementById('save-config');
const apiKeyInput = document.getElementById('api-key');
const clientIdInput = document.getElementById('client-id');
const authorizeButton = document.getElementById('authorize_button');
const signoutButton = document.getElementById('signout_button');
const fileListContainer = document.getElementById('file-list-container');
const fileList = document.getElementById('file-list');
const viewerContainer = document.getElementById('viewer-container');
const pdfTitle = document.getElementById('pdf-title');
const pdfViewer = document.getElementById('pdf-viewer');
const backToListBtn = document.getElementById('back-to-list');
const loadingFiles = document.getElementById('loading-files');
const loadingPdf = document.getElementById('loading-pdf');
const progressBar = document.getElementById('progress-bar');
const prevPageBtn = document.getElementById('prev-page');
const nextPageBtn = document.getElementById('next-page');
const pageNumSpan = document.getElementById('page-num');
const pageCountSpan = document.getElementById('page-count');

// PDF 뷰어 관련 상태 변수
let pdfDoc = null;
let pageNum = 1;
let pageRendering = false;
let pageNumPending = null;
const scale = 1.5;

// --- 설정 및 초기화 ---

// window.onload를 사용하여 페이지의 모든 리소스(스크립트 포함)가 로드된 후 초기화 로직을 실행합니다.
window.onload = function() {
    // PDF.js 워커 스크립트 경로 설정
    // 이 코드는 pdf.js 라이브러리가 로드된 후에 실행되어야 하므로 window.onload 내부에 위치합니다.
    pdfjsLib.GlobalWorkerOptions.workerSrc = `https://mozilla.github.io/pdf.js/build/pdf.js`;
    
    API_KEY = localStorage.getItem('DRIVE_API_KEY');
    CLIENT_ID = localStorage.getItem('DRIVE_CLIENT_ID');
    
    if (API_KEY && CLIENT_ID) {
        apiKeyInput.value = API_KEY;
        clientIdInput.value = CLIENT_ID;
        configSection.classList.add('hidden');
        mainContent.classList.remove('hidden');
        
        // Google API 클라이언트 초기화
        initializeApiClients();
    }
};

function initializeApiClients() {
    // 1. GAPI Client 초기화 (Drive API용)
    gapi.load('client', async () => {
        try {
            await gapi.client.init({
                apiKey: API_KEY,
                discoveryDocs: DISCOVERY_DOCS,
            });
            gapiInited = true;
            maybeEnableButtons();
        } catch (error) {
            console.error('Error initializing GAPI client:', error);
            alert('Google API 클라이언트를 초기화하는 데 실패했습니다. API 키가 올바른지 확인하세요.');
        }
    });

    // 2. GIS Client 초기화 (인증용)
    try {
        tokenClient = google.accounts.oauth2.initTokenClient({
            client_id: CLIENT_ID,
            scope: SCOPES,
            callback: '', // 콜백은 인증 시점에 동적으로 할당됩니다.
        });
        gisInited = true;
        maybeEnableButtons();
    } catch (error) {
        console.error('Error initializing Google Sign-In client:', error);
        alert('Google 인증 클라이언트를 초기화하는 데 실패했습니다. Client ID가 올바른지 확인하세요.');
    }
}

saveConfigBtn.addEventListener('click', () => {
    const apiKey = apiKeyInput.value.trim();
    const clientId = clientIdInput.value.trim();

    if (!apiKey || !clientId) {
        alert('API 키와 클라이언트 ID를 모두 입력해주세요.');
        return;
    }

    API_KEY = apiKey;
    CLIENT_ID = clientId;
    localStorage.setItem('DRIVE_API_KEY', API_KEY);
    localStorage.setItem('DRIVE_CLIENT_ID', CLIENT_ID);
    
    alert('설정이 저장되었습니다. 페이지를 새로고침합니다.');
    window.location.reload();
});


function maybeEnableButtons() {
    // 두 클라이언트가 모두 준비되면 인증 버튼을 활성화합니다.
    if (gapiInited && gisInited) {
        authorizeButton.classList.remove('hidden');
    }
}

// --- 인증 관련 ---

authorizeButton.onclick = handleAuthClick;
signoutButton.onclick = handleSignoutClick;

function handleAuthClick() {
    tokenClient.callback = async (resp) => {
        if (resp.error !== undefined) {
            throw (resp);
        }
        updateSigninStatus(true);
    };

    if (gapi.client.getToken() === null) {
        tokenClient.requestAccessToken({prompt: 'consent'});
    } else {
        tokenClient.requestAccessToken({prompt: ''});
    }
}

function handleSignoutClick() {
    const token = gapi.client.getToken();
    if (token !== null) {
        google.accounts.oauth2.revoke(token.access_token);
        gapi.client.setToken('');
        updateSigninStatus(false);
    }
}

function updateSigninStatus(isSignedIn) {
    if (isSignedIn) {
        authorizeButton.classList.add('hidden');
        signoutButton.classList.remove('hidden');
        fileListContainer.classList.remove('hidden');
        listPdfFiles();
    } else {
        authorizeButton.classList.remove('hidden');
        signoutButton.classList.add('hidden');
        fileListContainer.classList.add('hidden');
        viewerContainer.classList.add('hidden');
        fileList.innerHTML = '';
    }
}

// --- Google Drive API ---

async function listPdfFiles() {
    fileList.innerHTML = '';
    loadingFiles.classList.remove('hidden');
    try {
        const response = await gapi.client.drive.files.list({
            'pageSize': 50,
            'fields': 'nextPageToken, files(id, name, iconLink)',
            'q': "mimeType='application/pdf' and trashed=false",
            'orderBy': 'modifiedTime desc'
        });
        
        loadingFiles.classList.add('hidden');
        const files = response.result.files;
        if (files && files.length > 0) {
            files.forEach(file => {
                const fileItem = document.createElement('div');
                fileItem.className = 'file-item flex items-center p-3 my-1 cursor-pointer rounded-md transition duration-200';
                fileItem.onclick = () => loadPdf(file.id, file.name);
                
                const img = document.createElement('img');
                img.src = file.iconLink;
                img.className = 'w-6 h-6 mr-3';
                fileItem.appendChild(img);

                const span = document.createElement('span');
                span.textContent = file.name;
                fileItem.appendChild(span);
                fileList.appendChild(fileItem);
            });
        } else {
            fileList.innerHTML = '<p class="text-gray-500">PDF 파일을 찾을 수 없습니다.</p>';
        }
    } catch (err) {
        loadingFiles.classList.add('hidden');
        fileList.innerHTML = `<p class="text-red-500">파일을 불러오는 중 오류가 발생했습니다: ${err.message}</p>`;
        console.error(err);
    }
}

// --- PDF 뷰어 ---

async function loadPdf(fileId, fileName) {
    mainContent.classList.add('hidden');
    viewerContainer.classList.remove('hidden');
    loadingPdf.classList.remove('hidden');
    pdfViewer.innerHTML = '';
    pdfTitle.textContent = fileName;
    progressBar.style.width = '0%';

    try {
        const accessToken = gapi.client.getToken().access_token;
        const response = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
            method: 'GET',
            headers: { 'Authorization': `Bearer ${accessToken}` }
        });

        if (!response.ok) {
            throw new Error(`PDF 다운로드에 실패했습니다. (상태: ${response.status})`);
        }

        const reader = response.body.getReader();
        const contentLength = +response.headers.get('Content-Length');
        let receivedLength = 0;
        let chunks = [];

        while(true) {
            const {done, value} = await reader.read();
            if (done) break;
            chunks.push(value);
            receivedLength += value.length;
            if(contentLength) {
                progressBar.style.width = `${(receivedLength / contentLength) * 100}%`;
            }
        }

        let chunksAll = new UintArray(receivedLength);
        let position = 0;
        for(let chunk of chunks) {
            chunksAll.set(chunk, position);
            position += chunk.length;
        }

        const pdfData = chunksAll.buffer;
        
        pdfDoc = await pdfjsLib.getDocument({ data: pdfData }).promise;
        pageCountSpan.textContent = pdfDoc.numPages;
        pageNum = 1;
        renderPage(pageNum);
        
    } catch (err) {
        pdfViewer.innerHTML = `<p class="text-red-500">PDF를 불러오는 중 오류가 발생했습니다: ${err.message}</p>`;
        console.error(err);
    } finally {
        loadingPdf.classList.add('hidden');
    }
}

function renderPage(num) {
    pageRendering = true;
    pdfDoc.getPage(num).then((page) => {
        const viewport = page.getViewport({ scale: scale });
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        canvas.height = viewport.height;
        canvas.width = viewport.width;

        const renderContext = {
            canvasContext: ctx,
            viewport: viewport
        };
        const renderTask = page.render(renderContext);

        renderTask.promise.then(() => {
            pageRendering = false;
            if (pageNumPending !== null) {
                renderPage(pageNumPending);
                pageNumPending = null;
            }
            pdfViewer.innerHTML = '';
            pdfViewer.appendChild(canvas);
        });
    });

    pageNumSpan.textContent = num;
}

function queueRenderPage(num) {
    if (pageRendering) {
        pageNumPending = num;
    } else {
        renderPage(num);
    }
}

function onPrevPage() {
    if (pageNum <= 1) return;
    pageNum--;
    queueRenderPage(pageNum);
}

function onNextPage() {
    if (pageNum >= pdfDoc.numPages) return;
    pageNum++;
    queueRenderPage(pageNum);
}

prevPageBtn.addEventListener('click', onPrevPage);
nextPageBtn.addEventListener('click', onNextPage);

backToListBtn.addEventListener('click', () => {
    viewerContainer.classList.add('hidden');
    mainContent.classList.remove('hidden');
    pdfDoc = null; // 메모리 해제
});


