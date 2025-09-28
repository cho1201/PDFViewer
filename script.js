// ================= 구글 API 설정 =================
const CLIENT_ID = "747899768010-bn6ja4bi7ku0gjeh5nb3q4b648drel30.apps.googleusercontent.com";
const API_KEY = "AIzaSyD6EFWkU_78a-yA19Gh99WkMtcla4rR9YI";
const DISCOVERY_DOCS = ["https://www.googleapis.com/discovery/v1/apis/drive/v3/rest"];
const SCOPES = "https://www.googleapis.com/auth/drive.readonly";

// ================= PDF.js 설정 =================
pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.worker.min.js";

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
      const authInstance = gapi.auth2.getAuthInstance();
      const loginButton = document.getElementById("loginButton");

      loginButton.onclick = () => {
        authInstance.signIn().then(listPDFs);
      };
    });
}

// ================= PDF 파일 목록 불러오기 =================
function listPDFs() {
  gapi.client.drive.files
    .list({
      q: "mimeType='application/pdf'",
      pageSize: 20,
      fields: "files(id, name)",
    })
    .then((response) => {
      const files = response.result.files;
      const listDiv = document.getElementById("pdfList");
      listDiv.innerHTML = "";

      if (files && files.length > 0) {
        files.forEach((file) => {
          const a = document.createElement("a");
          a.textContent = file.name;
          a.href = "#";
          a.onclick = (e) => {
            e.preventDefault();
            loadPDF(file.id);
          };
          listDiv.appendChild(a);
        });
      } else {
        listDiv.textContent = "PDF 파일이 없습니다.";
      }
    });
}

// ================= PDF 로드 및 표시 =================
function loadPDF(fileId) {
  gapi.client.drive.files
    .get({
      fileId: fileId,
      alt: "media",
    })
    .then((response) => {
      const blob = new Blob([response.body], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      renderPDF(url);
    });
}

function renderPDF(url) {
  const canvas = document.getElementById("pdf-canvas");
  const ctx = canvas.getContext("2d");

  pdfjsLib.getDocument(url).promise.then((pdf) => {
    pdf.getPage(1).then((page) => {
      const viewport = page.getViewport({ scale: 1.5 });
      canvas.width = viewport.width;
      canvas.height = viewport.height;

      const renderContext = {
        canvasContext: ctx,
        viewport: viewport,
      };
      page.render(renderContext);
    });
  });
}
