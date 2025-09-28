// ================= 경고: 중요 보안 정보 =================
// 실제 서비스에서는 클라이언트 측 코드에 API 키와 클라이언트 ID를 절대 노출해서는 안 됩니다.
// 이 정보들은 해킹의 대상이 될 수 있습니다.
// 반드시 백엔드 서버를 통해 API를 호출하고 키를 안전하게 관리하세요.
const CLIENT_ID = "747899768010-bn6ja4bi7ku0gjeh5nb3q4b648drel30.apps.googleusercontent.com";
const API_KEY = "AIzaSyD6EFWkU_78a-yA19Gh99WkMtcla4rR9YI";
// =======================================================

const DISCOVERY_DOCS = ["https://www.googleapis.com/discovery/v1/apis/drive/v3/rest"];
const SCOPES = "https://www.googleapis.com/auth/drive.readonly";

// ================= PDF.js 설정 =================
pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.worker.min.js";

// ================= 애플리케이션 상태 변수 =================
let gapiAuthInstance;
let pdfDoc = null;
let currentPageNum = 1;

// ================= DOM 요소 =================
const authButton = document.getElementById("authButton");
const pdfListDiv = document.getElementById("pdfList");
const loader = document.getElementById("loader");
const pdfNav = document.getElementById("pdf-navigation");
const pageNumSpan = document.getElementById("page-num");
const pageCountSpan = document.getElementById("page-count");
const prevPageButton = document.getElementById("prev-page");
const nextPageButton = document.getElementById("next-page");
const pdfCanvas = document.getElementById("pdf-canvas");

// ================= 구글 API 초기화 =================
function gapiLoaded() {
  gapi.load("client:auth2", initClient);
}

function initClient() {
  gapi.client
    .init({
      apiKey: API_KEY,
      clientId: CLIENT_ID,
      discoveryDocs: DISCOVERY_DOCS,
      scope: SCOPES,
    })
    .then(() => {
      gapiAuthInstance = gapi.auth2.getAuthInstance();
      // 로그인 상태 변경 리스너 설정
      gapiAuthInstance.isSignedIn.listen(updateSigninStatus);
      // 초기 로그인 상태 확인 및 UI 업데이트
      updateSigninStatus(gapiAuthInstance.isSignedIn.get());
      authButton.onclick = handleAuthClick;
    })
    .catch(error => {
      console.error("Google API 클라이언트 초기화 오류:", error);
      alert("Google API 초기화에 실패했습니다. 페이지를 새로고침 해주세요.");
    });
}

// ================= 인증 처리 =================
function handleAuthClick() {
  if (gapiAuthInstance.isSignedIn.get()) {
    gapiAuthInstance.signOut();
  } else {
    gapiAuthInstance.signIn();
  }
}

function updateSigninStatus(isSignedIn) {
  if (isSignedIn) {
    authButton.textContent = "Google Drive 로그아웃";
    pdfListDiv.style.display = "block";
    listPDFs();
  } else {
    authButton.textContent = "Google Drive 로그인";
    pdfListDiv.innerHTML = "";
    pdfListDiv.style.display = "none";
    clearPdfViewer();
  }
}

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

// ================= PDF 로드 및 표시 =================
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


// ================= 페이지 이동 이벤트 리스너 =================
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
