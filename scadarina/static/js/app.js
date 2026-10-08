import {
  initViewer,
  clearScene,
  displayGeometry,
  updateMeshColor,
  onResize,
  loader,
  objLoader,
  threeMFLoader
} from './viewer.js';

import {
  initEditor,
  parseParameters,
  getCode,
  setCode,
  getCurrentParameters,
  setStlMode as setEditorStlMode
} from './editor.js';

import {
  initModels,
  loadServerModels,
  setActiveServerFile
} from './models.js';

// DOM elements
const container = document.getElementById('viewport-container');
const editor = document.getElementById('editor');
const controlsContainer = document.getElementById('controls-container');
const modelsList = document.getElementById('models-list');
const downloadBtn = document.getElementById('downloadBtn');
const renderBtn = document.getElementById('renderBtn');
const saveServerBtn = document.getElementById('saveServerBtn');
const saveCopyServerChk = document.getElementById('saveCopyServerChk');
const refreshModelsBtn = document.getElementById('refreshModelsBtn');
const newFolderBtn = document.getElementById('newFolderBtn');
const modelsFolderUploadInput = document.getElementById('modelsFolderUploadInput');
const modelsCurrentPath = document.getElementById('modelsCurrentPath');
const fileTitle = document.getElementById('file-title');
const toggleCodeBtn = document.getElementById('toggleCodeBtn');
const toggleParamsBtn = document.getElementById('toggleParamsBtn');
const sidebarRight = document.getElementById('sidebar-right');
const sidebarRightResizer = document.getElementById('sidebar-right-resizer');
const editorGutter = document.getElementById('editor-gutter');
const sidebarLeft = document.getElementById('sidebar-left');
const sidebarParams = document.getElementById('sidebar-params');
const sidebarLeftResizer = document.getElementById('sidebar-left-resizer');
const modelsPanel = document.getElementById('models-panel');
const resizer = document.getElementById('models-resizer');

const modeSolidBtn = document.getElementById('modeSolidBtn');
const modeEdgesBtn = document.getElementById('modeEdgesBtn');
const modeMeshBtn = document.getElementById('modeMeshBtn');
const modeWireframeBtn = document.getElementById('modeWireframeBtn');
const toggleGridBtn = document.getElementById('toggleGridBtn');
const toggleMeasureBtn = document.getElementById('toggleMeasureBtn');
const measureReadout = document.getElementById('measure-readout');
const toggleOrthoBtn = document.getElementById('toggleOrthoBtn');
const toggleUpAxisBtn = document.getElementById('toggleUpAxisBtn');
const scaleBar = document.getElementById('scale-bar');
const scaleLabel = document.getElementById('scale-label');
const fileInput = document.getElementById('fileInput');

const engineDropdown = document.getElementById('engineDropdown');
const engineSelectBtn = document.getElementById('engineSelectBtn');
const engineSelectLabel = document.getElementById('engineSelectLabel');
const engineDropdownMenu = document.getElementById('engineDropdownMenu');
const STORAGE_KEY_ENGINE = 'scadarina_engine';
let selectedEngine = 'stable';

if (engineDropdown && engineSelectBtn && engineSelectLabel && engineDropdownMenu) {
  const savedEngine = localStorage.getItem(STORAGE_KEY_ENGINE);
  if (savedEngine && (savedEngine === 'stable' || savedEngine === 'nightly')) {
    selectedEngine = savedEngine;
    engineSelectLabel.textContent = selectedEngine;
    engineDropdownMenu.querySelectorAll('.custom-dropdown-item').forEach(item => {
      item.classList.toggle('active', item.dataset.value === selectedEngine);
    });
  }

  engineSelectBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    engineDropdown.classList.toggle('open');
  });

  engineDropdownMenu.querySelectorAll('.custom-dropdown-item').forEach(item => {
    item.addEventListener('click', (e) => {
      e.stopPropagation();
      selectedEngine = item.dataset.value;
      engineSelectLabel.textContent = selectedEngine;
      localStorage.setItem(STORAGE_KEY_ENGINE, selectedEngine);
      engineDropdownMenu.querySelectorAll('.custom-dropdown-item').forEach(el => el.classList.remove('active'));
      item.classList.add('active');
      engineDropdown.classList.remove('open');
    });
  });

  window.addEventListener('click', () => {
    engineDropdown.classList.remove('open');
  });
}

// State
let loadedFileName = 'model';
let isFullRenderAvailable = false;
let isBusy = false;
let isStlMode = false;
let latestStlBlob = null;
let statusTimeout = null;

export function setStatus(text, isError = false, persistent = false) {
  const el = document.getElementById('status');
  if (statusTimeout) {
    clearTimeout(statusTimeout);
    statusTimeout = null;
  }
  if (!text) {
    el.style.display = 'none';
    return;
  }
  el.innerHTML = text;
  el.style.color = isError ? '#ff3b30' : '#ffffff';
  el.style.borderTopColor = isError ? '#ff3b30' : '#f09c2a';
  el.style.display = 'block';

  if (!isError && !persistent) {
    statusTimeout = setTimeout(() => {
      el.style.display = 'none';
    }, 3000);
  }
}

export function setStlMode(enabled, fileFormat = '3D') {
  isStlMode = enabled;
  renderBtn.disabled = enabled;
  saveServerBtn.disabled = enabled;
  setEditorStlMode(enabled, fileFormat);
}

export async function triggerRun(isPreview = false) {
  if (isBusy || isStlMode) return false;
  isBusy = true;
  setStatus(isPreview ? 'generating preview...' : 'rendering full model...', false, true);
  const code = getCode();

  try {
    const chosenEngine = selectedEngine || 'stable';
    const res = await fetch('/render', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        code: code,
        params: getCurrentParameters(),
        preview: isPreview,
        engine: chosenEngine
      })
    });

    if (!res.ok) {
      const errData = await res.json().catch(() => ({ error: 'Unknown server error' }));
      throw new Error(errData.error || 'Server error');
    }

    latestStlBlob = await res.blob();
    const buffer = await latestStlBlob.arrayBuffer();
    const geometry = loader.parse(buffer);
    displayGeometry(geometry, isPreview);

    isFullRenderAvailable = !isPreview;
    if (isPreview) {
      setStatus('PREVIEW ONLY<br><span style="font-size:11px; opacity:0.85; font-style:italic;">click `full render` for final quality</span>', false, true);
    } else {
      setStatus('render completed.', false, false);
    }
    isBusy = false;
    return true;
  } catch (err) {
    setStatus('Error: ' + err.message, true, true);
    isBusy = false;
    return false;
  }
}

async function promptSaveFile() {
  if (!latestStlBlob) return;
  const defaultName = `${loadedFileName}.stl`;
  let fileName = prompt('Filename for STL download:', defaultName);
  if (!fileName) return;
  if (!fileName.toLowerCase().endsWith('.stl')) fileName += '.stl';

  // Download file to client
  const url = URL.createObjectURL(latestStlBlob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.click();
  URL.revokeObjectURL(url);
  setStatus('STL successfully exported.');

  // If checked, save copy to /models/export
  if (saveCopyServerChk && saveCopyServerChk.checked) {
    try {
      const formData = new FormData();
      formData.append('file', latestStlBlob, fileName);
      formData.append('filename', fileName);
      const res = await fetch('/api/models/export', {
        method: 'POST',
        body: formData
      });
      const data = await res.json();
      if (res.ok) {
        setStatus(`STL exported & copy saved to /models/_export/${data.filename}`);
      } else {
        setStatus(`Export copy error: ${data.error}`, true);
      }
    } catch (err) {
      setStatus(`Failed to save export copy: ${err.message}`, true);
    }
  }
}

async function openServerModel(relPath, displayFilename) {
  clearScene();
  setStatus(`opening ${displayFilename}...`, false, true);
  try {
    const res = await fetch(`/api/models/file?path=${encodeURIComponent(relPath)}`);
    if (!res.ok) throw new Error('Error retrieving file');

    loadedFileName = displayFilename.replace(/\.[^/.]+$/, '');
    setActiveServerFile(relPath);
    fileTitle.textContent = displayFilename;

    document.querySelectorAll('.file-entry').forEach((el) => {
      const nameSpan = el.querySelector('.file-name-label');
      el.classList.toggle('active', nameSpan && nameSpan.textContent === displayFilename);
    });

    const lowerName = displayFilename.toLowerCase();
    if (lowerName.endsWith('.stl')) {
      setStlMode(true, 'STL');
      latestStlBlob = await res.blob();
      const buffer = await latestStlBlob.arrayBuffer();
      const geometry = loader.parse(buffer);
      displayGeometry(geometry, false, true);
      isFullRenderAvailable = true;
      setStatus(`${displayFilename} loaded.`, false, false);
      return;
    } else if (lowerName.endsWith('.obj')) {
      setStlMode(true, 'OBJ');
      latestStlBlob = null;
      const text = await res.text();
      const group = objLoader.parse(text);
      displayGeometry(group, false, true);
      isFullRenderAvailable = false;
      setStatus(`${displayFilename} loaded.`, false, false);
      return;
    } else if (lowerName.endsWith('.3mf')) {
      setStlMode(true, '3MF');
      latestStlBlob = null;
      const buffer = await res.arrayBuffer();
      const group = threeMFLoader.parse(buffer);
      displayGeometry(group, false, true);
      isFullRenderAvailable = false;
      setStatus(`${displayFilename} loaded.`, false, false);
      return;
    }

    setStlMode(false);
    const data = await res.json();
    setCode(data.content);

    isFullRenderAvailable = false;
    parseParameters();
    await triggerRun(true);
  } catch (err) {
    setStatus('Error: ' + err.message, true);
  }
}

// Event Listeners for Toolbar Actions
downloadBtn.addEventListener('click', async () => {
  if (isStlMode) {
    await promptSaveFile();
    return;
  }
  if (!isFullRenderAvailable) {
    setStatus('No final render available. Rendering model first...', false, true);
    const success = await triggerRun(false);
    if (!success) return;
  }
  await promptSaveFile();
});

renderBtn.addEventListener('click', () => triggerRun(false));

saveServerBtn.addEventListener('click', async () => {
  const defaultName = `${loadedFileName}.scad`;
  const targetName = prompt('Filename to save into /models:', defaultName);
  if (!targetName) return;

  setStatus('Saving file to server...');
  try {
    const res = await fetch('/api/models', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ filename: targetName, code: getCode() })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);

    loadedFileName = data.filename.replace(/\.[^/.]+$/, '');
    setActiveServerFile(data.filename);
    fileTitle.textContent = data.filename;
    setStatus(`Saved as ${data.filename}`);
    loadServerModels();
  } catch (err) {
    setStatus('Save error: ' + err.message, true);
  }
});

fileInput.addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (!file) return;
  clearScene();
  setStatus(`opening ${file.name}...`, false, true);
  setActiveServerFile(null);
  loadedFileName = file.name.replace(/\.[^/.]+$/, '');
  fileTitle.textContent = file.name;
  document.querySelectorAll('.file-entry').forEach((el) => el.classList.remove('active'));

  const lowerName = file.name.toLowerCase();
  if (lowerName.endsWith('.stl')) {
    setStlMode(true, 'STL');
    const reader = new FileReader();
    reader.onload = (evt) => {
      latestStlBlob = new Blob([evt.target.result], { type: 'application/sla' });
      const geometry = loader.parse(evt.target.result);
      displayGeometry(geometry, false, true);
      isFullRenderAvailable = true;
      setStatus(`${file.name} loaded.`, false, false);
    };
    reader.readAsArrayBuffer(file);
    return;
  } else if (lowerName.endsWith('.obj')) {
    setStlMode(true, 'OBJ');
    latestStlBlob = null;
    const reader = new FileReader();
    reader.onload = (evt) => {
      const group = objLoader.parse(evt.target.result);
      displayGeometry(group, false, true);
      isFullRenderAvailable = false;
      setStatus(`${file.name} loaded.`, false, false);
    };
    reader.readAsText(file);
    return;
  } else if (lowerName.endsWith('.3mf')) {
    setStlMode(true, '3MF');
    latestStlBlob = null;
    const reader = new FileReader();
    reader.onload = (evt) => {
      const group = threeMFLoader.parse(evt.target.result);
      displayGeometry(group, false, true);
      isFullRenderAvailable = false;
      setStatus(`${file.name} loaded.`, false, false);
    };
    reader.readAsArrayBuffer(file);
    return;
  }

  setStlMode(false);
  const reader = new FileReader();
  reader.onload = (evt) => {
    setCode(evt.target.result);
    isFullRenderAvailable = false;
    parseParameters();
    triggerRun(true);
  };
  reader.readAsText(file);
});

// App Initialization
initViewer({
  container,
  modeSolidBtn,
  modeEdgesBtn,
  modeMeshBtn,
  modeWireframeBtn,
  toggleGridBtn,
  toggleMeasureBtn,
  measureReadout,
  toggleOrthoBtn,
  toggleUpAxisBtn,
  scaleBar,
  scaleLabel
});

initEditor(
  {
    editor,
    editorGutter,
    controlsContainer,
    toggleCodeBtn,
    sidebarRight,
    sidebarRightResizer
  },
  {
    onParamChange: () => {
      isFullRenderAvailable = false;
      triggerRun(true);
    },
    onColorChange: (hex) => {
      updateMeshColor(hex);
    },
    onResize: onResize,
    onCodeBlur: () => {
      isFullRenderAvailable = false;
    }
  }
);

// Toggle parameters sidebar
toggleParamsBtn.addEventListener('click', () => {
  const isCollapsed = sidebarLeft.classList.toggle('collapsed');
  if (isCollapsed) {
    sidebarLeft.style.removeProperty('width');
  }
  toggleParamsBtn.textContent = isCollapsed ? 'show parameters' : 'hide parameters';
  onResize();
  setTimeout(onResize, 160);
});

// Resize parameters sidebar (sidebar-params)
let isResizingLeft = false;
sidebarLeftResizer.addEventListener('mousedown', (e) => {
  e.preventDefault();
  isResizingLeft = true;
  sidebarLeftResizer.classList.add('resizing');
  sidebarLeft.classList.add('resizing');
  document.body.style.cursor = 'ew-resize';
  document.body.style.userSelect = 'none';
});

window.addEventListener('mousemove', (e) => {
  if (!isResizingLeft) return;
  const newWidth = Math.max(200, e.clientX);
  sidebarLeft.style.width = `${newWidth}px`;
  onResize();
});

window.addEventListener('mouseup', () => {
  if (isResizingLeft) {
    isResizingLeft = false;
    sidebarLeftResizer.classList.remove('resizing');
    sidebarLeft.classList.remove('resizing');
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
  }
});

initModels(
  {
    modelsPanel,
    modelsList,
    modelsCurrentPath,
    refreshModelsBtn,
    newFolderBtn,
    modelsFolderUploadInput,
    resizer,
    sidebarLeft
  },
  {
    setStatus,
    onOpenModel: openServerModel
  }
);

// Dynamic alignment so distance (export STL -> show parameters) matches (save to /models -> full render)
function alignCodeToggleBar() {
  const codeToggleBar = document.getElementById('code-toggle-bar');
  if (!codeToggleBar || !saveServerBtn || !renderBtn || !downloadBtn) return;
  const saveRect = saveServerBtn.getBoundingClientRect();
  const renderRect = renderBtn.getBoundingClientRect();
  const downloadRect = downloadBtn.getBoundingClientRect();
  const gap = renderRect.left - saveRect.right;
  if (gap > 0) {
    codeToggleBar.style.left = `${Math.round(downloadRect.right + gap)}px`;
  }
}

// Custom Tooltips System matching SCADarina design
function initTooltips() {
  const tooltip = document.createElement('div');
  tooltip.id = 'custom-tooltip';
  document.body.appendChild(tooltip);

  let currentTarget = null;
  let showTimeout = null;

  document.addEventListener('mouseover', (e) => {
    const el = e.target.closest('[title], [data-tooltip]');
    if (!el) return;

    if (el.hasAttribute('title')) {
      const text = el.getAttribute('title');
      if (text) {
        el.setAttribute('data-tooltip', text);
        el.removeAttribute('title');
      }
    }

    const text = el.getAttribute('data-tooltip');
    if (!text) return;

    currentTarget = el;
    tooltip.textContent = text;

    clearTimeout(showTimeout);
    showTimeout = setTimeout(() => {
      if (currentTarget !== el) return;
      tooltip.style.display = 'block';

      const rect = el.getBoundingClientRect();
      const tipRect = tooltip.getBoundingClientRect();

      let left = rect.left + (rect.width - tipRect.width) / 2;
      let top = rect.bottom + 6;

      if (left < 6) left = 6;
      if (left + tipRect.width > window.innerWidth - 6) {
        left = window.innerWidth - tipRect.width - 6;
      }
      if (top + tipRect.height > window.innerHeight - 6) {
        top = rect.top - tipRect.height - 6;
      }

      tooltip.style.left = `${Math.round(left)}px`;
      tooltip.style.top = `${Math.round(top)}px`;
      tooltip.classList.add('visible');
    }, 600);
  });

  document.addEventListener('mouseout', (e) => {
    if (!currentTarget) return;
    if (e.target.closest('[data-tooltip]') === currentTarget) {
      clearTimeout(showTimeout);
      currentTarget = null;
      tooltip.classList.remove('visible');
      tooltip.style.display = 'none';
    }
  });

  window.addEventListener('scroll', () => {
    if (currentTarget) {
      tooltip.classList.remove('visible');
      tooltip.style.display = 'none';
      currentTarget = null;
    }
  }, true);
}

// Initial bootstrap
loadServerModels();
parseParameters();
triggerRun(true);
alignCodeToggleBar();
initTooltips();
window.addEventListener('resize', alignCodeToggleBar);
if (document.fonts && document.fonts.ready) {
  document.fonts.ready.then(alignCodeToggleBar);
}
