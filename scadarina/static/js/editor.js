let editor = null;
let editorGutter = null;
let controlsContainer = null;
let toggleCodeBtn = null;
let sidebarRight = null;
let sidebarRightResizer = null;

let currentParameters = {};
let onParamChange = null;
let onColorChange = null;
let onResizeCb = null;
let isStlMode = false;

function updateLineNumbers() {
  if (!editor || !editorGutter) return;
  const lines = editor.value.split('\n').length;
  let numbers = '';
  for (let i = 1; i <= lines; i++) {
    numbers += i + '\n';
  }
  editorGutter.textContent = numbers;
}

export function initEditor(elements, callbacks) {
  editor = elements.editor;
  editorGutter = elements.editorGutter;
  controlsContainer = elements.controlsContainer;
  toggleCodeBtn = elements.toggleCodeBtn;
  sidebarRight = elements.sidebarRight;
  sidebarRightResizer = elements.sidebarRightResizer;

  onParamChange = callbacks.onParamChange;
  onColorChange = callbacks.onColorChange;
  onResizeCb = callbacks.onResize;

  updateLineNumbers();
  editor.addEventListener('input', updateLineNumbers);
  editor.addEventListener('scroll', () => {
    if (editorGutter) {
      editorGutter.scrollTop = editor.scrollTop;
    }
  });

  toggleCodeBtn.addEventListener('click', () => {
    sidebarRight.classList.toggle('open');
    const isOpen = sidebarRight.classList.contains('open');
    if (!isOpen) {
      sidebarRight.style.width = '';
    }
    toggleCodeBtn.textContent = isOpen ? 'hide code' : 'show code';
    toggleCodeBtn.title = isOpen ? 'hide code' : 'show code';
    if (onResizeCb) {
      setTimeout(onResizeCb, 160);
    }
  });

  // Resizing for editor (sidebar-right)
  let isResizingRight = false;
  if (sidebarRightResizer) {
    sidebarRightResizer.addEventListener('mousedown', (e) => {
      e.preventDefault();
      isResizingRight = true;
      sidebarRightResizer.classList.add('resizing');
      sidebarRight.classList.add('resizing');
      document.body.style.cursor = 'ew-resize';
      document.body.style.userSelect = 'none';
    });

    window.addEventListener('mousemove', (e) => {
      if (!isResizingRight) return;
      const rect = sidebarRight.getBoundingClientRect();
      const newWidth = Math.max(0, e.clientX - rect.left);
      sidebarRight.style.width = `${newWidth}px`;
      if (onResizeCb) onResizeCb();
    });

    window.addEventListener('mouseup', () => {
      if (isResizingRight) {
        isResizingRight = false;
        sidebarRightResizer.classList.remove('resizing');
        sidebarRight.classList.remove('resizing');
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
      }
    });
  }

  editor.addEventListener('blur', () => {
    if (isStlMode) return;
    if (callbacks.onCodeBlur) {
      callbacks.onCodeBlur();
    }
    parseParameters();
  });
}

export function setStlMode(enabled, fileFormat = '3D') {
  isStlMode = enabled;
  if (enabled) {
    controlsContainer.innerHTML = `<span style="color:#888888; font-size:11px; padding: 4px;">${fileFormat.toUpperCase()} file loaded (no SCAD parameters).</span>`;
  }
}

export function getCode() {
  return editor.value;
}

export function setCode(newCode) {
  editor.value = newCode;
  updateLineNumbers();
}

export function getCurrentParameters() {
  return currentParameters;
}

export function setCurrentParameters(params) {
  currentParameters = params;
}

export function createStepper(inputEl) {
  const wrapper = document.createElement('div');
  wrapper.className = 'number-stepper';
  wrapper.appendChild(inputEl);

  const btns = document.createElement('div');
  btns.className = 'stepper-btns';

  const upBtn = document.createElement('button');
  upBtn.type = 'button';
  upBtn.className = 'stepper-btn stepper-up';
  upBtn.tabIndex = -1;
  upBtn.addEventListener('click', (e) => {
    e.preventDefault();
    inputEl.stepUp();
    inputEl.dispatchEvent(new Event('input'));
    inputEl.dispatchEvent(new Event('change'));
  });

  const downBtn = document.createElement('button');
  downBtn.type = 'button';
  downBtn.className = 'stepper-btn stepper-down';
  downBtn.tabIndex = -1;
  downBtn.addEventListener('click', (e) => {
    e.preventDefault();
    inputEl.stepDown();
    inputEl.dispatchEvent(new Event('input'));
    inputEl.dispatchEvent(new Event('change'));
  });

  btns.appendChild(upBtn);
  btns.appendChild(downBtn);
  wrapper.appendChild(btns);
  return wrapper;
}

export function updateCodeText(varName, newValStr) {
  const code = editor.value;
  const pattern = new RegExp(`^([ \\t]*${varName}[ \\t]*=[ \\t]*)([^;\\r\\n]+)([ \\t]*;.*)$`, 'm');
  editor.value = code.replace(pattern, `$1${newValStr}$3`);
}

export function parseParameters() {
  if (isStlMode) return;
  const lines = editor.value.split('\n');
  controlsContainer.innerHTML = '';
  currentParameters = {};
  let detected = 0;
  let isHiddenSection = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    if (line.startsWith('/*') && /\[hidden\]/i.test(line)) {
      isHiddenSection = true;
      continue;
    }
    if (line.startsWith('/*') && !/\[hidden\]/i.test(line)) {
      isHiddenSection = false;
      continue;
    }
    if (line.startsWith('//') || line.startsWith('/*')) continue;
    if (isHiddenSection) continue;

    const match = line.match(/^([a-zA-Z0-9_]+)\s*=\s*([^;]+)\s*;\s*(?:\/\/)?\s*(.*)?$/);
    if (!match) continue;

    const varName = match[1];
    let rawVal = match[2].trim();
    let comment = (match[3] || '').trim();

    let prevComment = '';
    if (i > 0 && lines[i - 1].trim().startsWith('//')) {
      prevComment = lines[i - 1].trim().replace(/^\/\/\s*/, '');
    }

    let type = 'unknown';
    let initialVal = null;
    let options = null;
    let range = null;

    const isExplicitText = /^\[(text|string)\]$/i.test(comment);
    const rangeMatch = comment.match(/^\[([0-9.-]+):([0-9.-]+)(?::([0-9.-]+))?\]/);
    const dropdownMatch = comment.match(/^\[([^\]]+)\]/);
    const isColorComment = /\bcolor\b/i.test(comment) || /^\[color\]$/i.test(comment);
    const isHexColor = /^["']#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})["']$/.test(rawVal);

    if (isExplicitText) {
      type = 'string';
      const clean = rawVal.replace(/^["']|["']$/g, '');
      const isNum = !isNaN(parseFloat(clean)) && isFinite(clean);
      initialVal = isNum ? parseFloat(clean) : clean;
      comment = comment.replace(/^\[(text|string)\]/i, '').trim();
    } else if (rangeMatch) {
      type = 'slider';
      if (rangeMatch[3]) {
        range = { min: parseFloat(rangeMatch[1]), step: parseFloat(rangeMatch[2]), max: parseFloat(rangeMatch[3]) };
      } else {
        range = { min: parseFloat(rangeMatch[1]), step: 1, max: parseFloat(rangeMatch[2]) };
      }
      initialVal = parseFloat(rawVal);
      comment = comment.replace(rangeMatch[0], '').trim();
    } else if (dropdownMatch && (dropdownMatch[1].includes(',') || dropdownMatch[1].includes(':'))) {
      type = 'dropdown';
      options = dropdownMatch[1].split(',').map(item => {
        const rawItem = item.trim();
        const colonIdx = rawItem.indexOf(':');
        if (colonIdx !== -1) {
          const val = rawItem.substring(0, colonIdx).trim().replace(/^["']|["']$/g, '');
          const lbl = rawItem.substring(colonIdx + 1).trim().replace(/^["']|["']$/g, '');
          return { value: val, label: lbl };
        }
        const clean = rawItem.replace(/^["']|["']$/g, '');
        return { value: clean, label: clean };
      });
      initialVal = rawVal.replace(/^["']|["']$/g, '');
      comment = comment.replace(dropdownMatch[0], '').trim();
    } else if (isColorComment || isHexColor) {
      type = 'color';
      let hex = rawVal.replace(/^["']|["']$/g, '').trim();
      if (!hex.startsWith('#')) hex = '#' + hex;
      if (hex.length === 4) {
        hex = '#' + hex[1] + hex[1] + hex[2] + hex[2] + hex[3] + hex[3];
      }
      initialVal = hex;
      if (onColorChange) onColorChange(hex);
    } else if (/^(true|false)$/i.test(rawVal)) {
      type = 'bool';
      initialVal = rawVal.toLowerCase() === 'true';
    } else if (!isNaN(parseFloat(rawVal)) && isFinite(rawVal)) {
      type = 'number';
      initialVal = parseFloat(rawVal);
    } else if (/^["'].*["']$/.test(rawVal)) {
      type = 'string';
      initialVal = rawVal.replace(/^["']|["']$/g, '');
    }

    if (type === 'unknown') continue;

    detected++;
    currentParameters[varName] = initialVal;

    const displayTitle = prevComment || comment || varName;

    const item = document.createElement('div');
    item.className = 'param-item';

    const desc = document.createElement('div');
    desc.className = 'param-desc';
    desc.textContent = displayTitle;
    desc.title = displayTitle;
    item.appendChild(desc);

    const row = document.createElement('div');
    row.className = 'param-row';

    const nameSpan = document.createElement('span');
    nameSpan.className = 'param-name';
    nameSpan.textContent = varName;
    nameSpan.title = varName;
    row.appendChild(nameSpan);

    if (type === 'color') {
      const colorInput = document.createElement('input');
      colorInput.type = 'color';
      colorInput.value = initialVal;
      colorInput.addEventListener('input', () => {
        currentParameters[varName] = colorInput.value;
        if (onColorChange) onColorChange(colorInput.value);
        updateCodeText(varName, `"${colorInput.value}"`);
      });
      colorInput.addEventListener('change', () => {
        if (onParamChange) onParamChange();
      });
      row.appendChild(colorInput);
    } else if (type === 'bool') {
      const chk = document.createElement('input');
      chk.type = 'checkbox';
      chk.checked = initialVal;
      chk.addEventListener('change', () => {
        currentParameters[varName] = chk.checked;
        updateCodeText(varName, chk.checked ? 'true' : 'false');
        if (onParamChange) onParamChange();
      });
      row.appendChild(chk);
    } else if (type === 'dropdown') {
      const select = document.createElement('select');
      options.forEach(opt => {
        const el = document.createElement('option');
        el.value = opt.value;
        el.textContent = opt.label;
        if (String(opt.value) === String(initialVal)) el.selected = true;
        select.appendChild(el);
      });
      select.addEventListener('change', () => {
        const isNum = !isNaN(parseFloat(select.value)) && isFinite(select.value) && !rawVal.startsWith('"');
        const parsedVal = isNum ? parseFloat(select.value) : select.value;
        currentParameters[varName] = parsedVal;
        const repr = typeof parsedVal === 'string' ? `"${parsedVal}"` : parsedVal;
        updateCodeText(varName, repr);
        if (onParamChange) onParamChange();
      });
      row.appendChild(select);
    } else if (type === 'slider') {
      const numInput = document.createElement('input');
      numInput.type = 'number';
      numInput.value = initialVal;
      numInput.min = range.min;
      numInput.max = range.max;
      numInput.step = range.step || 'any';

      const slider = document.createElement('input');
      slider.type = 'range';
      slider.min = range.min;
      slider.max = range.max;
      slider.step = range.step;
      slider.value = initialVal;

      slider.addEventListener('input', () => {
        numInput.value = slider.value;
        currentParameters[varName] = parseFloat(slider.value);
        updateCodeText(varName, slider.value);
      });
      slider.addEventListener('change', () => {
        if (onParamChange) onParamChange();
      });

      numInput.addEventListener('input', () => {
        slider.value = numInput.value;
        currentParameters[varName] = parseFloat(numInput.value);
        updateCodeText(varName, numInput.value);
      });
      numInput.addEventListener('change', () => {
        if (onParamChange) onParamChange();
      });

      row.appendChild(slider);
      row.appendChild(createStepper(numInput));
    } else if (type === 'number') {
      const numInput = document.createElement('input');
      numInput.type = 'number';
      numInput.value = initialVal;
      const strVal = String(rawVal);
      const decMatch = strVal.match(/\.([0-9]+)/);
      numInput.step = decMatch ? Math.pow(10, -decMatch[1].length).toString() : '1';
      numInput.addEventListener('input', () => {
        currentParameters[varName] = parseFloat(numInput.value);
        updateCodeText(varName, numInput.value);
      });
      numInput.addEventListener('change', () => {
        if (onParamChange) onParamChange();
      });
      row.appendChild(createStepper(numInput));
    } else if (type === 'string') {
      const textInput = document.createElement('input');
      textInput.type = 'text';
      textInput.value = initialVal;
      textInput.addEventListener('input', () => {
        const raw = textInput.value.trim();
        const isNum = !isNaN(parseFloat(raw)) && isFinite(raw);
        currentParameters[varName] = isNum ? parseFloat(raw) : raw;
        const repr = isNum ? raw : `"${raw}"`;
        updateCodeText(varName, repr);
      });
      textInput.addEventListener('change', () => {
        if (onParamChange) onParamChange();
      });
      row.appendChild(textInput);
    }

    item.appendChild(row);
    controlsContainer.appendChild(item);
  }

  if (detected === 0) {
    controlsContainer.innerHTML = '<span style="color:#888888; font-size:11px; padding: 4px;">no parameters detected.</span>';
  }
}
