// ================= 경고: 중요 보안 정보 =================
// 실제 서비스에서는 클라이언트 측 코드에 API 키와 클라이언트 ID를 절대 노출해서는 안 됩니다.
const CLIENT_ID = "747899768010-bn6ja4bi7ku0gjeh5nb3q4b648drel30.apps.googleusercontent.com";
const API_KEY = "AIzaSyD6EFWkU_78a-yA19Gh99WkMtcla4rR9YI";
// =======================================================

const DISCOVERY_DOCS = ["https://www.googleapis.com/discovery/v1/apis/drive/v3/rest"];
const SCOPES = "https://www.googleapis.com/auth/drive.readonly";

// ================= PDF.js 설정 =================
pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.worker.min.js";

// ================= 애플리케이션 상태 변수 =================
let tokenClient;
let pdfDoc = null;
let currentPageNum = 1;

// ================= DOM 요소 =================
const gsiContainer = document.getElementById("gsi-container");
const signOutButton = document.getElementById("signout-button");
const pdfListTitle = document.getElementById("pdf-list-title");
const pdfListDiv = document.getElementById("pdfList");
const loader = document.getElementById("loader");
const pdfNav = document.getElementById("pdf-navigation");
const pageNumSpan = document.getElementById("page-num");
const pageCountSpan = document.getElementById("page-count");
const prevPageButton = document.getElementById("prev-page");
const nextPageButton = document.getElementById("next-page");
const pdfCanvas = document.getElementById("pdf-canvas");

// ================= 구글 API 로더 =================

// 1. GAPI 클라이언트 로드
function gapiLoaded() {
  gapi.load('client', initializeGapiClient);
}

// 2. GAPI 클라이언트 초기화 (Drive API 사용 준비)
async function initializeGapiClient() {
  await gapi.client.init({
    apiKey: API_KEY,
    discoveryDocs: DISCOVERY_DOCS,
  });
}

// 3. GIS 클라이언트 로드
function gisLoaded() {
  tokenClient = google.accounts.oauth2.initTokenClient({
    client_id: CLIENT_ID,
    scope: SCOPES,
    callback: gisCallback, // 인증 성공 시 호출될 콜백 함수
  });
  
  // 로그인 버튼 렌더링
  google.accounts.id.initialize({
    client_id: CLIENT_ID,
    callback: () => {} // 로그인 버튼은 토큰 요청 용도로만 사용
  });
  google.accounts.id.renderButton(
    gsiContainer,
    { theme: "outline", size: "large", text: "signin_with", width: "220" }
  );
  google.accounts.id.prompt(); // 페이지 로드 시 자동 로그인 프롬프트 표시
}

// ================= 인증 및 데이터 처리 =================

// 4. 인증 성공 후 콜백 함수
function gisCallback(tokenResponse) {
  if (tokenResponse && tokenResponse.access_token) {
    gapi.client.setToken(tokenResponse); // GAPI 클라이언트에 액세스 토큰 설정
    updateSigninStatus(true);
    listPDFs();
  } else {
    console.error("GIS 콜백에서 유효한 토큰을 받지 못했습니다.");
    updateSigninStatus(false);
  }
}

// 로그인 버튼 대신 토큰 클라이언트 사용
function handleAuthClick() {
  tokenClient.requestAccessToken({ prompt: 'consent' });
}

// 로그아웃 처리
function handleSignOutClick() {
    gapi.client.setToken(null);
    updateSigninStatus(false);
}

function updateSigninStatus(isSignedIn) {
  if (isSignedIn) {
    gsiContainer.style.display = 'none';
    signOutButton.style.display = 'block';
    pdfListTitle.style.display = 'block';
  } else {
    gsiContainer.style.display = 'block';
    signOutButton.style.display = 'none';
    pdfListTitle.style.display = 'none';
    pdfListDiv.innerHTML = '';
    clearPdfViewer();
  }
}

signOutButton.onclick = handleSignOutClick;

// ================= PDF 파일 목록 불러오기 =================
function listPDFs() {
  gapi.client.drive.files
    .list({
      q: "mimeType='application/pdf'",
      pageSize: 20,
      fields: "files(id, name)",
      orderBy: "modifiedTime desc",
    })
    .then(response => {
      const files = response.result.files;
      pdfListDiv.innerHTML = "";

      if (files && files.length > 0) {
        files.forEach(file => {
          const a = document.createElement("a");
          a.textContent = file.name;
          a.href = "#";
          a.onclick = e => {
            e.preventDefault();
            loadPDF(file.id);
          };
          pdfListDiv.appendChild(a);
        });
      } else {
        pdfListDiv.textContent = "PDF 파일이 없습니다.";
      }
    })
    .catch(error => {
      console.error("PDF 목록 로드 오류:", error);
      pdfListDiv.textContent = "파일 목록을 불러오는 데 실패했습니다.";
    });
}

// ================= PDF 로드 및 표시 (이하 코드는 이전과 동일) =================
function loadPDF(fileId) {
  clearPdfViewer();
  loader.style.display = "block";

  gapi.client.drive.files
    .get({ fileId: fileId, alt: "media" })
    .then(response => {
      const blob = new Blob([response.body], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      renderPDF(url);
    })
    .catch(error => {
      console.error("PDF 파일 다운로드 오류:", error);
      alert("PDF 파일을 불러오는 데 실패했습니다.");
      loader.style.display = "none";
    });
}

function renderPDF(url) {
  pdfjsLib.getDocument(url).promise.then(pdf => {
    pdfDoc = pdf;
    pageCountSpan.textContent = pdfDoc.numPages;
    currentPageNum = 1;
    renderPage(currentPageNum);
    pdfNav.style.visibility = "visible";
  }).catch(error => {
    console.error("PDF 렌더링 오류:", error);
    alert("PDF를 표시하는 데 실패했습니다. 파일이 손상되었을 수 있습니다.");
    clearPdfViewer();
  }).finally(() => {
      loader.style.display = "none";
  });
}

function renderPage(num) {
  const ctx = pdfCanvas.getContext("2d");

  pdfDoc.getPage(num).then(page => {
    const viewport = page.getViewport({ scale: 1.5 });
    pdfCanvas.height = viewport.height;
    pdfCanvas.width = viewport.width;

    page.render({
      canvasContext: ctx,
      viewport: viewport,
    });
    pageNumSpan.textContent = num;
  });
}

function clearPdfViewer() {
    pdfDoc = null;
    const ctx = pdfCanvas.getContext('2d');
    ctx.clearRect(0, 0, pdfCanvas.width, pdfCanvas.height);
    pdfNav.style.visibility = "hidden";
    pageNumSpan.textContent = 0;
    pageCountSpan.textContent = 0;
}

prevPageButton.addEventListener("click", () => {
  if (!pdfDoc || currentPageNum <= 1) return;
  currentPageNum--;
  renderPage(currentPageNum);
});

nextPageButton.addEventListener("click", () => {
  if (!pdfDoc || currentPageNum >= pdfDoc.numPages) return;
  currentPageNum++;
  renderPage(currentPageNum);
});
