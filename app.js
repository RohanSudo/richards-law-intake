// ===== CONFIGURATION =====
const UPLOAD_WEBHOOK = 'https://auto.brandjetmedia.com/webhook/police-report-upload';
const APPROVE_WEBHOOK = 'https://auto.brandjetmedia.com/webhook/approve-matter';

// ===== STATE =====
let selectedFile = null;
let extractedData = null;

// ===== DOM REFS =====
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

// ===== INITIALIZATION =====
document.addEventListener('DOMContentLoaded', () => {
  initClock();
  initDropZone();
  initTabs();
  initButtons();
  initDemoMode();
});

// ===== CLOCK =====
function initClock() {
  function updateClock() {
    const now = new Date();
    let h = now.getHours();
    const m = String(now.getMinutes()).padStart(2, '0');
    const ampm = h >= 12 ? 'PM' : 'AM';
    h = h % 12 || 12;
    $('#taskbar-clock').textContent = `${h}:${m} ${ampm}`;
  }
  updateClock();
  setInterval(updateClock, 30000);
}

// ===== DROP ZONE =====
function initDropZone() {
  const zone = $('#drop-zone');
  const input = $('#file-input');

  zone.addEventListener('click', (e) => {
    if (e.target.closest('.remove-file')) return;
    input.click();
  });

  input.addEventListener('change', () => {
    if (input.files.length) handleFileSelect(input.files[0]);
  });

  zone.addEventListener('dragover', (e) => {
    e.preventDefault();
    zone.classList.add('dragover');
  });

  zone.addEventListener('dragleave', () => {
    zone.classList.remove('dragover');
  });

  zone.addEventListener('drop', (e) => {
    e.preventDefault();
    zone.classList.remove('dragover');
    const file = e.dataTransfer.files[0];
    if (file && file.type === 'application/pdf') {
      handleFileSelect(file);
    } else {
      showError('Please drop a PDF file.');
    }
  });

  $('#remove-file').addEventListener('click', (e) => {
    e.stopPropagation();
    clearFile();
  });
}

function handleFileSelect(file) {
  selectedFile = file;
  $('#drop-zone-content').style.display = 'none';
  $('#drop-zone-file').style.display = 'block';
  $('#file-name').textContent = file.name;
  $('#btn-upload').disabled = false;
  setStatus(`Selected: ${file.name}`);
}

function clearFile() {
  selectedFile = null;
  $('#file-input').value = '';
  $('#drop-zone-content').style.display = '';
  $('#drop-zone-file').style.display = 'none';
  $('#btn-upload').disabled = true;
  setStatus('Ready');
}

// ===== TABS =====
function initTabs() {
  $$('menu[role="tablist"] li[role="tab"]').forEach((tab) => {
    tab.addEventListener('click', (e) => {
      e.preventDefault();
      const tabId = tab.dataset.tab;

      // Update tab selection
      tab.closest('menu').querySelectorAll('li[role="tab"]').forEach((t) => {
        t.setAttribute('aria-selected', t === tab ? 'true' : 'false');
      });

      // Show corresponding content
      $$('.tab-content').forEach((c) => {
        c.classList.toggle('active', c.id === `tab-${tabId}`);
      });
    });
  });
}

// ===== DEMO MODE =====
function initDemoMode() {
  $('#demo-toggle').addEventListener('change', (e) => {
    $('#demo-month').disabled = !e.target.checked;
    if (!e.target.checked) $('#demo-month').value = '';
  });
}

// ===== BUTTONS =====
function initButtons() {
  $('#btn-upload').addEventListener('click', handleUpload);
  $('#btn-approve').addEventListener('click', handleApprove);
  $('#btn-back').addEventListener('click', () => switchState('upload'));
  $('#btn-new-case').addEventListener('click', handleNewCase);
  $('#btn-error-ok').addEventListener('click', hideError);
  $('#error-close').addEventListener('click', hideError);
}

// ===== STATE SWITCHING =====
function switchState(state) {
  $$('.state').forEach((s) => s.classList.remove('active'));
  $(`#state-${state}`).classList.add('active');

  const titles = {
    upload: 'Richards & Law - Case Intake',
    verify: 'Richards & Law - Review Report Data',
    processing: 'Richards & Law - Processing Case'
  };
  $('#window-title').textContent = titles[state] || titles.upload;
  $('#taskbar-item').innerHTML = `&#128194; ${titles[state] || titles.upload}`;
}

// ===== UPLOAD HANDLER =====
async function handleUpload() {
  if (!selectedFile) return;

  // Show loading
  const container = document.querySelector('.upload-container');
  if (container) container.style.display = 'none';
  $('#upload-loading').style.display = 'block';
  document.body.classList.add('loading');
  setStatus('Extracting data from police report...');

  try {
    const formData = new FormData();
    formData.append('file', selectedFile);
    formData.append('client_email', $('#upload-email').value);

    const response = await fetch(UPLOAD_WEBHOOK, {
      method: 'POST',
      body: formData
    });

    if (!response.ok) {
      throw new Error(`Server returned ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();
    extractedData = data;

    // Populate verify form
    populateForm(data);

    // Carry email from upload state
    $('#f-email').value = $('#upload-email').value;

    // Switch to verify
    resetUploadUI();
    switchState('verify');
    setStatus('Review extracted data | All fields populated');

  } catch (err) {
    resetUploadUI();
    showError(`Failed to extract data from PDF.\n\n${err.message}`);
    setStatus('Error during extraction');
  }
}

function resetUploadUI() {
  document.body.classList.remove('loading');
  const container = document.querySelector('.upload-container');
  if (container) container.style.display = '';
  $('#upload-loading').style.display = 'none';
}

// ===== FORM POPULATION =====
function populateForm(data) {
  $$('[data-field]').forEach((el) => {
    const field = el.dataset.field;
    if (data[field] !== undefined && data[field] !== null) {
      el.value = data[field];
    }
  });

  // Recalculate SOL if accident_date changes
  $('#f-accident-date').addEventListener('input', recalcSOL);
}

function recalcSOL() {
  const dateStr = $('#f-accident-date').value;
  if (!dateStr) return;
  const parts = dateStr.split('-');
  if (parts.length !== 3) return;
  const year = parseInt(parts[0]) + 8;
  $('#f-sol-date').value = `${year}-${parts[1]}-${parts[2]}`;
}

// ===== APPROVAL HANDLER =====
async function handleApprove() {
  // Gather all field values
  const payload = {};
  $$('[data-field]').forEach((el) => {
    payload[el.dataset.field] = el.value;
  });

  // Add demo mode month if enabled
  if ($('#demo-toggle').checked && $('#demo-month').value) {
    payload.demo_mode_month = $('#demo-month').value;
  }

  // Switch to processing state
  switchState('processing');
  const clientName = `${payload.client_first_name} ${payload.client_last_name}`;
  $('#processing-title').textContent = `Processing case for ${clientName}...`;
  setStatus('Processing case...');

  // Reset processing UI
  resetProcessingUI();

  // Start simulated steps + real API call
  processCase(payload);
}

// ===== PROCESSING =====
const STEP_TIMINGS = [1200, 1800, 1500, 2500, 2000, 1200, 2000];

function resetProcessingUI() {
  $$('.step').forEach((s) => {
    s.className = 'step';
    s.querySelector('.step-icon').innerHTML = '&#9675;';
  });
  $('#progress-fill').style.width = '0%';
  $('#processing-result').style.display = 'none';
  $('#result-success').style.display = 'none';
  $('#result-error').style.display = 'none';
  $('#btn-new-case').disabled = true;
}

async function processCase(payload) {
  // Start the real API call in the background
  const apiPromise = fetch(APPROVE_WEBHOOK, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  }).then(async (res) => {
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || `Server error ${res.status}`);
    return data;
  });

  // Simulate step progress
  let currentStep = 0;
  let apiDone = false;
  let apiResult = null;
  let apiError = null;

  apiPromise
    .then((data) => { apiDone = true; apiResult = data; })
    .catch((err) => { apiDone = true; apiError = err; });

  // Animate steps with timings
  for (let i = 0; i < STEP_TIMINGS.length; i++) {
    // Mark current step active
    activateStep(i);
    currentStep = i;

    const progress = Math.round(((i + 0.5) / STEP_TIMINGS.length) * 100);
    $('#progress-fill').style.width = `${progress}%`;

    await delay(STEP_TIMINGS[i]);

    // Check if API returned an error
    if (apiError) {
      markStepError(i);
      showProcessingError(apiError);
      return;
    }

    // Mark step complete
    completeStep(i);
    const doneProgress = Math.round(((i + 1) / STEP_TIMINGS.length) * 100);
    $('#progress-fill').style.width = `${doneProgress}%`;
  }

  // All simulated steps done - wait for API if not done yet
  if (!apiDone) {
    setStatus('Finalizing...');
    try {
      apiResult = await apiPromise;
    } catch (err) {
      apiError = err;
    }
  }

  if (apiError) {
    showProcessingError(apiError);
  } else {
    showProcessingSuccess(apiResult);
  }
}

function activateStep(index) {
  const step = $(`.step[data-step="${index}"]`);
  if (!step) return;
  step.className = 'step active';
  step.querySelector('.step-icon').innerHTML = '&#9658;';
}

function completeStep(index) {
  const step = $(`.step[data-step="${index}"]`);
  if (!step) return;
  step.className = 'step completed';
  step.querySelector('.step-icon').innerHTML = '&#10003;';
}

function markStepError(index) {
  const step = $(`.step[data-step="${index}"]`);
  if (!step) return;
  step.className = 'step error';
  step.querySelector('.step-icon').innerHTML = '&#10007;';
}

function showProcessingSuccess(data) {
  $('#progress-fill').style.width = '100%';
  $('#processing-result').style.display = 'block';
  $('#result-success').style.display = 'block';
  $('#result-error').style.display = 'none';

  const detail = data.matter_id
    ? `Matter ID: ${data.matter_id} | Contact ID: ${data.contact_id}`
    : 'All steps completed successfully.';
  $('#result-detail').textContent = detail;

  $('#btn-new-case').disabled = false;
  $('#processing-title').textContent = $('#processing-title').textContent.replace('Processing', 'Processed');
  setStatus('Case processed successfully');
}

function showProcessingError(err) {
  $('#processing-result').style.display = 'block';
  $('#result-success').style.display = 'none';
  $('#result-error').style.display = 'block';
  $('#error-detail').textContent = err.message || 'An unexpected error occurred.';
  $('#btn-new-case').disabled = false;
  setStatus('Error during processing');
}

// ===== NEW CASE =====
function handleNewCase() {
  clearFile();
  extractedData = null;

  // Reset verify form
  $$('[data-field]').forEach((el) => {
    if (el.tagName === 'SELECT') {
      el.selectedIndex = 0;
    } else {
      el.value = '';
    }
  });
  $('#upload-email').value = 'talent.legal-engineer.hackathon.automation-email@swans.co';
  $('#demo-toggle').checked = false;
  $('#demo-month').disabled = true;
  $('#demo-month').value = '';

  // Reset tabs to first
  $$('menu[role="tablist"] li[role="tab"]').forEach((t, i) => {
    t.setAttribute('aria-selected', i === 0 ? 'true' : 'false');
  });
  $$('.tab-content').forEach((c, i) => {
    c.classList.toggle('active', i === 0);
  });

  switchState('upload');
  setStatus('Ready');
}

// ===== ERROR DIALOG =====
function showError(message) {
  let backdrop = $('.error-backdrop');
  if (!backdrop) {
    backdrop = document.createElement('div');
    backdrop.className = 'error-backdrop';
    document.body.appendChild(backdrop);
  }
  backdrop.style.display = 'block';

  $('#error-message').textContent = message;
  $('#error-dialog').style.display = '';
}

function hideError() {
  $('#error-dialog').style.display = 'none';
  const backdrop = $('.error-backdrop');
  if (backdrop) backdrop.style.display = 'none';
}

// ===== HELPERS =====
function setStatus(text) {
  $('#status-text').textContent = text;
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}