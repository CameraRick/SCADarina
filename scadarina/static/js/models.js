let modelsPanel = null;
let modelsList = null;
let modelsCurrentPath = null;
let refreshModelsBtn = null;
let newFolderBtn = null;
let modelsFolderUploadInput = null;
let resizer = null;
let sidebarLeft = null;

let currentBrowserPath = '';
let activeServerFile = null;
let setStatus = null;
let onOpenModel = null;

export function initModels(elements, callbacks) {
  modelsPanel = elements.modelsPanel;
  modelsList = elements.modelsList;
  modelsCurrentPath = elements.modelsCurrentPath;
  refreshModelsBtn = elements.refreshModelsBtn;
  newFolderBtn = elements.newFolderBtn;
  modelsFolderUploadInput = elements.modelsFolderUploadInput;
  resizer = elements.resizer;
  sidebarLeft = elements.sidebarLeft;

  setStatus = callbacks.setStatus;
  onOpenModel = callbacks.onOpenModel;

  let isResizing = false;
  resizer.addEventListener('mousedown', () => {
    isResizing = true;
    document.body.style.cursor = 'ns-resize';
    document.body.style.userSelect = 'none';
  });

  window.addEventListener('mousemove', (e) => {
    if (!isResizing) return;
    const sidebarRect = sidebarLeft.getBoundingClientRect();
    const newHeight = sidebarRect.bottom - e.clientY;
    if (newHeight >= 60 && newHeight <= (window.innerHeight - 200)) {
      modelsPanel.style.height = `${newHeight}px`;
    }
  });

  window.addEventListener('mouseup', () => {
    if (isResizing) {
      isResizing = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    }
  });

  refreshModelsBtn.addEventListener('click', loadServerModels);

  newFolderBtn.addEventListener('click', async () => {
    const folderName = prompt('New folder name:');
    if (!folderName) return;
    try {
      const res = await fetch('/api/models/folder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: currentBrowserPath, name: folderName })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      if (setStatus) setStatus(`Folder "${data.name}" created.`);
      loadServerModels();
    } catch (err) {
      if (setStatus) setStatus(`Folder error: ${err.message}`, true);
    }
  });

  modelsFolderUploadInput.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const targetDisplay = currentBrowserPath ? `/models/${currentBrowserPath}` : '/models';
    if (setStatus) setStatus(`Uploading ${file.name} to ${targetDisplay}...`);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('path', currentBrowserPath);
      formData.append('filename', file.name);
      const res = await fetch('/api/models/upload', {
        method: 'POST',
        body: formData
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      if (setStatus) setStatus(`Uploaded ${data.filename}`);
      loadServerModels();
    } catch (err) {
      if (setStatus) setStatus(`Upload error: ${err.message}`, true);
    } finally {
      modelsFolderUploadInput.value = '';
    }
  });
}

export function getActiveServerFile() {
  return activeServerFile;
}

export function setActiveServerFile(file) {
  activeServerFile = file;
}

export function getCurrentBrowserPath() {
  return currentBrowserPath;
}

export function setCurrentBrowserPath(path) {
  currentBrowserPath = path;
}

export async function loadServerModels() {
  try {
    const url = `/api/models${currentBrowserPath ? `?path=${encodeURIComponent(currentBrowserPath)}` : ''}`;
    const res = await fetch(url);
    const data = await res.json();
    modelsList.innerHTML = '';

    modelsCurrentPath.innerHTML = '';
    const rootLink = document.createElement('span');
    rootLink.textContent = '/models';
    rootLink.style.cursor = 'pointer';
    rootLink.title = 'root folder';
    rootLink.addEventListener('click', () => {
      currentBrowserPath = '';
      loadServerModels();
    });
    modelsCurrentPath.appendChild(rootLink);

    if (currentBrowserPath) {
      const parts = currentBrowserPath.split('/').filter(Boolean);
      let accPath = '';
      parts.forEach((part) => {
        accPath += (accPath ? '/' : '') + part;
        const thisPath = accPath;
        const slashSpan = document.createElement('span');
        slashSpan.textContent = '/';
        slashSpan.style.color = '#666666';
        const partSpan = document.createElement('span');
        partSpan.textContent = part;
        partSpan.style.cursor = 'pointer';
        partSpan.title = `go to /${thisPath}`;
        partSpan.addEventListener('click', () => {
          currentBrowserPath = thisPath;
          loadServerModels();
        });
        modelsCurrentPath.appendChild(slashSpan);
        modelsCurrentPath.appendChild(partSpan);
      });
    }

    if (currentBrowserPath) {
      const upLi = document.createElement('li');
      upLi.className = 'file-entry folder-entry';
      upLi.innerHTML = '<img src="/svg/folder.svg" class="folder-icon" alt=""><span class="file-name-label">/..</span>';
      upLi.title = 'up one folder';
      upLi.addEventListener('click', () => {
        const parts = currentBrowserPath.split('/').filter(Boolean);
        parts.pop();
        currentBrowserPath = parts.join('/');
        loadServerModels();
      });
      modelsList.appendChild(upLi);
    }

    const folders = data.folders || [];
    const files = data.files || [];

    if (folders.length === 0 && files.length === 0) {
      const emptyLi = document.createElement('li');
      emptyLi.innerHTML = '<span style="color:#888888; font-size:11px; padding:4px;">folder is empty</span>';
      modelsList.appendChild(emptyLi);
      return;
    }

    folders.forEach(folder => {
      const relFolder = currentBrowserPath ? `${currentBrowserPath}/${folder}` : folder;
      const li = document.createElement('li');
      li.className = 'file-entry folder-entry';

      const icon = document.createElement('img');
      icon.src = '/svg/folder.svg';
      icon.className = 'folder-icon';
      icon.alt = '';

      const label = document.createElement('span');
      label.className = 'file-name-label';
      label.textContent = `/${folder}`;
      label.title = `enter folder /${folder}`;
      label.addEventListener('click', () => {
        currentBrowserPath = relFolder;
        loadServerModels();
      });

      const actions = document.createElement('div');
      actions.className = 'file-actions';

      const renBtn = document.createElement('button');
      renBtn.className = 'file-action-btn';
      renBtn.title = `rename folder /${folder}`;
      renBtn.innerHTML = '<span class="btn-icon" style="-webkit-mask-image: url(/svg/rename.svg); mask-image: url(/svg/rename.svg);"></span>';
      renBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        renameServerItem(relFolder, folder);
      });

      const delBtn = document.createElement('button');
      delBtn.className = 'file-action-btn';
      delBtn.title = `delete folder /${folder} permanently`;
      delBtn.innerHTML = '<span class="btn-icon" style="-webkit-mask-image: url(/svg/delete.svg); mask-image: url(/svg/delete.svg);"></span>';
      delBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        deleteServerItem(relFolder, folder, true);
      });

      actions.appendChild(renBtn);
      actions.appendChild(delBtn);

      li.appendChild(icon);
      li.appendChild(label);
      li.appendChild(actions);
      modelsList.appendChild(li);
    });

    files.forEach(file => {
      const relFile = currentBrowserPath ? `${currentBrowserPath}/${file}` : file;
      const li = document.createElement('li');
      li.className = 'file-entry';
      if (activeServerFile && (activeServerFile === relFile || activeServerFile === file)) {
        li.classList.add('active');
      }

      const label = document.createElement('span');
      label.className = 'file-name-label';
      label.textContent = file;
      label.title = `open ${file} in viewer and editor`;
      label.addEventListener('click', () => {
        if (onOpenModel) {
          onOpenModel(relFile, file);
        }
      });

      const actions = document.createElement('div');
      actions.className = 'file-actions';

      const dlBtn = document.createElement('button');
      dlBtn.className = 'file-action-btn';
      dlBtn.title = `download ${file} to your computer`;
      dlBtn.innerHTML = '<span class="btn-icon" style="-webkit-mask-image: url(/svg/download.svg); mask-image: url(/svg/download.svg);"></span>';
      dlBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        window.location.href = `/api/models/download?path=${encodeURIComponent(relFile)}`;
      });

      const renBtn = document.createElement('button');
      renBtn.className = 'file-action-btn';
      renBtn.title = `rename ${file}`;
      renBtn.innerHTML = '<span class="btn-icon" style="-webkit-mask-image: url(/svg/rename.svg); mask-image: url(/svg/rename.svg);"></span>';
      renBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        renameServerItem(relFile, file);
      });

      const delBtn = document.createElement('button');
      delBtn.className = 'file-action-btn';
      delBtn.title = `delete ${file} permanently`;
      delBtn.innerHTML = '<span class="btn-icon" style="-webkit-mask-image: url(/svg/delete.svg); mask-image: url(/svg/delete.svg);"></span>';
      delBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        deleteServerItem(relFile, file, false);
      });

      actions.appendChild(dlBtn);
      actions.appendChild(renBtn);
      actions.appendChild(delBtn);

      li.appendChild(label);
      li.appendChild(actions);
      modelsList.appendChild(li);
    });
  } catch (err) {
    modelsList.innerHTML = '<li style="color:#ff3b30; font-size:11px;">Error loading models</li>';
  }
}

export async function deleteServerItem(relPath, name, isFolder) {
  const typeLabel = isFolder ? 'folder' : 'file';
  if (!confirm(`Delete ${typeLabel} "${name}" from server?`)) return;
  try {
    const res = await fetch(`/api/models/item?path=${encodeURIComponent(relPath)}`, { method: 'DELETE' });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    if (setStatus) setStatus(`Deleted: ${name}`);
    if (activeServerFile === relPath) activeServerFile = null;
    loadServerModels();
  } catch (err) {
    if (setStatus) setStatus(`Delete error: ${err.message}`, true);
  }
}

export async function renameServerItem(relPath, oldName) {
  const newName = prompt(`Rename "${oldName}" to:`, oldName);
  if (!newName || newName === oldName) return;
  try {
    const res = await fetch('/api/models/rename', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ oldPath: relPath, newName: newName })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    if (setStatus) setStatus(`Renamed to "${data.newName}"`);
    if (activeServerFile === relPath) activeServerFile = null;
    loadServerModels();
  } catch (err) {
    if (setStatus) setStatus(`Rename error: ${err.message}`, true);
  }
}
