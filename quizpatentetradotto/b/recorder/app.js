import { initializeApp } from "https://www.gstatic.com/firebasejs/12.16.0/firebase-app.js";
import {
  getAuth,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut
} from "https://www.gstatic.com/firebasejs/12.16.0/firebase-auth.js";
import {
  getStorage,
  ref,
  uploadBytesResumable
} from "https://www.gstatic.com/firebasejs/12.16.0/firebase-storage.js";
import { authorizedRecorderUids, firebaseConfig } from "./firebase-config.js";

const chapterSelect = document.querySelector("#chapterSelect");
const subchapterSelect = document.querySelector("#subchapterSelect");
const questionList = document.querySelector("#questionList");
const questionCount = document.querySelector("#questionCount");
const questionTemplate = document.querySelector("#questionTemplate");
const pageNotice = document.querySelector("#pageNotice");
const recorderContent = document.querySelector("#recorderContent");
const authState = document.querySelector("#authState");
const showLoginButton = document.querySelector("#showLoginButton");
const logoutButton = document.querySelector("#logoutButton");
const loginDialog = document.querySelector("#loginDialog");
const loginForm = document.querySelector("#loginForm");
const loginError = document.querySelector("#loginError");

let chapters = [];
let subchapters = {};
let auth = null;
let storage = null;
let currentUser = null;
let activeRecording = null;
const recordings = new Map();
const previewUrls = new Map();

const firebaseConfigured = !Object.values(firebaseConfig).some(value =>
  String(value).startsWith("REPLACE_WITH_")
);

function showNotice(message, kind = "info") {
  pageNotice.textContent = message;
  pageNotice.className = `notice notice-${kind}`;
}

function hideNotice() {
  pageNotice.className = "notice hidden";
}

function initializeFirebase() {
  if (!firebaseConfigured) {
    authState.textContent = "Firebase setup needed";
    showLoginButton.disabled = true;
    showNotice(
      "Question browsing and recording are ready. Add your Firebase values in firebase-config.js to enable login and uploads."
    );
    return;
  }

  const firebaseApp = initializeApp(firebaseConfig);
  auth = getAuth(firebaseApp);
  storage = getStorage(firebaseApp);

  onAuthStateChanged(auth, user => {
    const authorizedUser = user && authorizedRecorderUids.includes(user.uid);

    if (user && !authorizedUser) {
      currentUser = null;
      authState.textContent = "Account not authorized";
      recorderContent.classList.add("hidden");
      loginError.textContent = "This Firebase account is not authorized to use the recorder.";
      if (!loginDialog.open) loginDialog.showModal();
      signOut(auth);
      return;
    }

    currentUser = authorizedUser ? user : null;
    authState.textContent = authorizedUser ? user.email : "Not signed in";
    showLoginButton.classList.toggle("hidden", Boolean(authorizedUser));
    logoutButton.classList.toggle("hidden", !authorizedUser);
    recorderContent.classList.toggle("hidden", !authorizedUser);

    if (authorizedUser) {
      if (loginDialog.open) loginDialog.close();
    } else if (!loginDialog.open) {
      loginDialog.showModal();
    }

    refreshUploadButtons();
  });
}

async function loadData() {
  try {
    const [chapterResponse, questionResponse] = await Promise.all([
      fetch("../../../assets/PatenteChapters.json"),
      fetch("../../../assets/PatenteQuestions.json")
    ]);

    if (!chapterResponse.ok || !questionResponse.ok) {
      throw new Error("One or both data files could not be loaded.");
    }

    [chapters, subchapters] = await Promise.all([
      chapterResponse.json(),
      questionResponse.json()
    ]);

    chapterSelect.innerHTML = [
      '<option value="">Select a chapter</option>',
      ...chapters.map(
        chapter =>
          `<option value="${chapter.id}">${chapter.id}. ${escapeHtml(chapter.chapterNameItalian)}</option>`
      )
    ].join("");
    chapterSelect.disabled = false;
  } catch (error) {
    showNotice(`Data error: ${error.message}`, "error");
  }
}

function populateSubchapters(chapterId) {
  const chapter = chapters.find(item => item.id === Number(chapterId));

  if (!chapter) {
    subchapterSelect.innerHTML = '<option value="">Select a chapter first</option>';
    subchapterSelect.disabled = true;
    renderQuestions(null);
    return;
  }

  const available = chapter.subChapterIds
    .map(id => subchapters[String(id)])
    .filter(Boolean);

  subchapterSelect.innerHTML = [
    '<option value="">Select a subchapter</option>',
    ...available.map(
      item =>
        `<option value="${item.subChapterId}">${item.subChapterId}. ${escapeHtml(item.subChapterNameItalian)}</option>`
    )
  ].join("");
  subchapterSelect.disabled = false;
  renderQuestions(null);
}

function renderQuestions(subchapterId) {
  cleanupActiveRecording();
  questionList.replaceChildren();

  const subchapter = subchapters[String(subchapterId)];
  if (!subchapter) {
    questionCount.textContent = "0 questions";
    questionList.innerHTML = '<div class="empty-state">Select a subchapter to see its questions.</div>';
    return;
  }

  questionCount.textContent = `${subchapter.questionIds.length} questions`;

  subchapter.questionsItalian.forEach((text, index) => {
    const questionId = subchapter.questionIds[index];
    const answer = subchapter.answers[index];
    const card = questionTemplate.content.firstElementChild.cloneNode(true);

    card.dataset.questionId = questionId;
    card.querySelector(".question-position").textContent = String(index + 1).padStart(2, "0");
    card.querySelector(".question-id").textContent = `Question ID ${questionId}`;
    card.querySelector(".question-text").textContent = text;

    const badge = card.querySelector(".answer-badge");
    badge.textContent = answer === "V" ? "Vero" : "Falso";
    badge.classList.add(answer === "V" ? "answer-true" : "answer-false");

    card.querySelector(".start-button").addEventListener("click", () => startRecording(card, questionId));
    card.querySelector(".stop-button").addEventListener("click", stopRecording);
    card.querySelector(".upload-button").addEventListener("click", () => uploadRecording(card, questionId));

    questionList.append(card);
  });
}

function preferredMimeType() {
  const candidates = [
    "audio/webm;codecs=opus",
    "audio/mp4",
    "audio/ogg;codecs=opus"
  ];
  return candidates.find(type => MediaRecorder.isTypeSupported(type)) || "";
}

async function startRecording(card, questionId) {
  if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
    setCardStatus(card, "Audio recording is not supported by this browser.", "error");
    return;
  }

  if (activeRecording?.recorder.state === "recording") {
    setCardStatus(card, "Stop the current recording before starting another.", "error");
    activeRecording.card.scrollIntoView({ behavior: "smooth", block: "center" });
    return;
  }

  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const mimeType = preferredMimeType();
    const recorder = mimeType
      ? new MediaRecorder(stream, { mimeType })
      : new MediaRecorder(stream);
    const chunks = [];

    recorder.addEventListener("dataavailable", event => {
      if (event.data.size) chunks.push(event.data);
    });

    recorder.addEventListener("stop", () => {
      const blob = new Blob(chunks, { type: recorder.mimeType || "audio/webm" });
      recordings.set(questionId, blob);

      if (previewUrls.has(questionId)) URL.revokeObjectURL(previewUrls.get(questionId));
      const previewUrl = URL.createObjectURL(blob);
      previewUrls.set(questionId, previewUrl);

      const preview = card.querySelector(".audio-preview");
      preview.src = previewUrl;
      preview.classList.remove("hidden");
      card.querySelector(".start-button").disabled = false;
      card.querySelector(".start-button").innerHTML = '<span class="record-dot"></span> Record again';
      card.querySelector(".stop-button").disabled = true;
      refreshUploadButtons();
      setCardStatus(card, "Recording ready to preview and submit.", "success");
      activeRecording = null;
    });

    activeRecording = { recorder, stream, card, questionId };
    recorder.start();
    card.querySelector(".start-button").disabled = true;
    card.querySelector(".stop-button").disabled = false;
    setCardStatus(card, "Recording… speak clearly, then press Stop.", "recording");
  } catch (error) {
    setCardStatus(card, `Microphone error: ${error.message}`, "error");
  }
}

function stopRecording() {
  if (!activeRecording || activeRecording.recorder.state !== "recording") return;
  activeRecording.recorder.stop();
  activeRecording.stream.getTracks().forEach(track => track.stop());
}

function cleanupActiveRecording() {
  if (!activeRecording) return;
  if (activeRecording.recorder.state === "recording") activeRecording.recorder.stop();
  activeRecording.stream.getTracks().forEach(track => track.stop());
  activeRecording = null;
}

async function uploadRecording(card, questionId) {
  const blob = recordings.get(questionId);
  if (!blob) return;

  if (!firebaseConfigured) {
    setCardStatus(card, "Add your Firebase configuration before uploading.", "error");
    return;
  }

  if (!currentUser) {
    setCardStatus(card, "Sign in as an authorized recorder before uploading.", "error");
    if (!loginDialog.open) loginDialog.showModal();
    return;
  }

  const uploadButton = card.querySelector(".upload-button");
  const uploadRow = card.querySelector(".upload-row");
  const progressValue = card.querySelector(".progress-value");
  const uploadPercent = card.querySelector(".upload-percent");
  uploadButton.disabled = true;
  uploadRow.classList.remove("hidden");
  setCardStatus(card, "Uploading recording…");

  // The object name is exactly the question ID. A new upload replaces the old one.
  const storageReference = ref(storage, `question-explanations/${questionId}`);
  const task = uploadBytesResumable(storageReference, blob, {
    contentType: blob.type,
    customMetadata: { questionId: String(questionId) }
  });

  task.on(
    "state_changed",
    snapshot => {
      const progress = Math.round((snapshot.bytesTransferred / snapshot.totalBytes) * 100);
      progressValue.style.width = `${progress}%`;
      uploadPercent.textContent = `${progress}%`;
    },
    error => {
      uploadButton.disabled = false;
      setCardStatus(card, `Upload failed: ${friendlyFirebaseError(error)}`, "error");
    },
    () => {
      uploadRow.classList.add("hidden");
      card.classList.add("uploaded");
      uploadButton.textContent = "Uploaded";
      setCardStatus(card, `Saved as question-explanations/${questionId}`, "success");
    }
  );
}

function refreshUploadButtons() {
  document.querySelectorAll(".question-card").forEach(card => {
    const questionId = Number(card.dataset.questionId);
    const button = card.querySelector(".upload-button");
    if (!card.classList.contains("uploaded")) {
      button.disabled = !recordings.has(questionId);
    }
  });
}

function setCardStatus(card, message, kind = "info") {
  const status = card.querySelector(".recording-status");
  status.textContent = message;
  status.className = `recording-status status-${kind}`;
}

function friendlyFirebaseError(error) {
  if (error.code === "storage/unauthorized") return "this account is not allowed by Storage rules.";
  if (error.code === "storage/quota-exceeded") return "the Firebase Storage quota was exceeded.";
  return error.message;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

chapterSelect.addEventListener("change", event => populateSubchapters(event.target.value));
subchapterSelect.addEventListener("change", event => renderQuestions(event.target.value));

showLoginButton.addEventListener("click", () => {
  if (!firebaseConfigured) {
    showNotice("Add your Firebase values in firebase-config.js before signing in.", "error");
    return;
  }
  loginError.textContent = "";
  if (!loginDialog.open) loginDialog.showModal();
});

logoutButton.addEventListener("click", () => signOut(auth));

loginDialog.addEventListener("cancel", event => {
  if (!currentUser) event.preventDefault();
});

loginForm.addEventListener("submit", async event => {
  event.preventDefault();
  loginError.textContent = "";

  try {
    const credential = await signInWithEmailAndPassword(
      auth,
      document.querySelector("#emailInput").value,
      document.querySelector("#passwordInput").value
    );

    if (!authorizedRecorderUids.includes(credential.user.uid)) {
      await signOut(auth);
      loginError.textContent = "This Firebase account is not authorized to use the recorder.";
      return;
    }

    loginForm.reset();
    if (loginDialog.open) loginDialog.close();
    hideNotice();
  } catch (error) {
    loginError.textContent = error.code === "auth/invalid-credential"
      ? "The email or password is incorrect."
      : error.message;
  }
});

window.addEventListener("beforeunload", () => {
  cleanupActiveRecording();
  previewUrls.forEach(url => URL.revokeObjectURL(url));
});

initializeFirebase();
loadData();
