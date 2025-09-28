// ================= 구글 API 설정 =================
const CLIENT_ID = "747899768010-bn6ja4bi7ku0gjeh5nb3q4b648drel30.apps.googleusercontent.com";
const API_KEY = "AIzaSyD6EFWkU_78a-yA19Gh99WkMtcla4rR9YI";
const DISCOVERY_DOCS = ["https://www.googleapis.com/discovery/v1/apis/drive/v3/rest"];
const SCOPES = "https://www.googleapis.com/auth/drive.readonly";

// ================= PDF.js 설정 =================
pdfjsLib.GlobalWorkerOptions.workerSrc =
  "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";

// ================= gapiInit 정의 =================
window.gapiInit = function () {
  const fileList = document.getElementById("file-list");
  const canvas = document.getElementById("pdf-canvas");
  const ctx = canvas.getContext("2d");

  gapi.load("client:auth2", initClient);

  function initClient() {
    gapi.client.init({
      apiKey: API_KEY,
      clientId: CLIENT_ID,
      discoveryDocs: DISCOVERY_DOCS,
      scope: SCOPES,
    }).then(() => {
      listPDFs(); // 바로 실행
    });
  }

  // Google Drive에서 PDF 목록 불러오기
  function listPDFs() {
    gapi.client.drive.files.list({
      q: "mimeType='application/pdf'",
      pageSize: 20,
      fields: "files(id, name)",
    }).then((response) => {
      const files = response.result.files;
      fileList.innerHTML = "";
      files.forEach((file) => {
        const li = document.createElement("li");
        const btn = document.createElement("button");
        btn.textContent = file.name;
        btn.onclick = () => loadPDF(file.id);
        li.appendChild(btn);
        fileList.appendChild(li);
      });
    });
  }

  function loadPDF(fileId) {
    gapi.client.drive.files.get({ fileId: fileId, alt: "media" }).then((resp) => {
      const blob = new Blob([resp.body], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      renderPDF(url);
    });
  }

  function renderPDF(url) {
    pdfjsLib.getDocument(url).promise.then((pdf) => {
      pdf.getPage(1).then((page) => {
        const viewport = page.getViewport({ scale: 1.5 });
        canvas.height = viewport.height;
        canvas.width = viewport.width;
        page.render({ canvasContext: ctx, viewport: viewport });
      });
    });
  }
};
