import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { STLLoader } from 'three/addons/loaders/STLLoader.js';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';
import { ThreeMFLoader } from 'three/addons/loaders/3MFLoader.js';

export const loader = new STLLoader();
export const objLoader = new OBJLoader();
export const threeMFLoader = new ThreeMFLoader();

let container = null;
let modeSolidBtn = null;
let modeEdgesBtn = null;
let modeMeshBtn = null;
let modeWireframeBtn = null;
let toggleGridBtn = null;
let toggleMeasureBtn = null;
let measureReadout = null;
let toggleOrthoBtn = null;
let toggleUpAxisBtn = null;
let fitBtn = null;
let fitBtn2 = null;
let scaleBar = null;
let scaleLabel = null;

let currentMesh = null;
let currentEdgesMesh = null;
let currentWireframeOverlay = null;
let customModelColor = null;
let currentShadingMode = 'edges';
let isMeasuring = false;
let measurePoints = [];
let isOrtho = false;
let upAxis = 'Z'; // 'Z' | 'Y'
let isCurrentMeshFile = false;
let helperMode = 'grid'; // 'grid' | 'axes' | 'off'
let gridHelperObj = null;
let axesHelperObj = null;
let updateViewCubeAndAxesForUpAxis = () => {};

let scene, renderer, perspCamera, orthoCamera, camera, controls, orthoControls;
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();
const measureGroup = new THREE.Group();

const width = () => container.clientWidth;
const height = () => container.clientHeight;

export function initViewer(elements) {
  container = elements.container;
  modeSolidBtn = elements.modeSolidBtn;
  modeEdgesBtn = elements.modeEdgesBtn;
  modeMeshBtn = elements.modeMeshBtn;
  modeWireframeBtn = elements.modeWireframeBtn;
  toggleGridBtn = elements.toggleGridBtn;
  toggleMeasureBtn = elements.toggleMeasureBtn;
  measureReadout = elements.measureReadout;
  toggleOrthoBtn = elements.toggleOrthoBtn;
  toggleUpAxisBtn = elements.toggleUpAxisBtn;
  fitBtn = elements.fitBtn;
  fitBtn2 = elements.fitBtn2;
  const isoBtn = elements.isoBtn || elements.fitBtn2 || elements.fitBtn;
  scaleBar = elements.scaleBar;
  scaleLabel = elements.scaleLabel;

  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x1e1e1e);

  THREE.Object3D.DEFAULT_UP.set(0, 0, 1);

  perspCamera = new THREE.PerspectiveCamera(45, width() / height(), 0.1, 2000);
  perspCamera.position.set(100, -100, 80);
  perspCamera.up.set(0, 0, 1);

  const orthoSize = 100;
  orthoCamera = new THREE.OrthographicCamera(
    -orthoSize * width() / height(), orthoSize * width() / height(),
    orthoSize, -orthoSize, 0.1, 2000
  );
  orthoCamera.position.set(100, -100, 80);
  orthoCamera.up.set(0, 0, 1);

  camera = perspCamera;

  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(width(), height());
  renderer.setPixelRatio(window.devicePixelRatio);
  container.appendChild(renderer.domElement);

  controls = new OrbitControls(perspCamera, renderer.domElement);
  orthoControls = new OrbitControls(orthoCamera, renderer.domElement);
  orthoControls.enabled = false;
  controls.enableDamping = true;

  scene.add(new THREE.AmbientLight(0xffffff, 0.7));
  const dir1 = new THREE.DirectionalLight(0xffffff, 0.8);
  dir1.position.set(150, -200, 250);
  scene.add(dir1);
  const dir2 = new THREE.DirectionalLight(0xffffff, 0.3);
  dir2.position.set(-150, 200, -150);
  scene.add(dir2);

  gridHelperObj = new THREE.GridHelper(300, 30, 0x444444, 0x282828);
  gridHelperObj.rotation.x = Math.PI / 2;
  scene.add(gridHelperObj);

  axesHelperObj = createOpenScadAxes(400);
  axesHelperObj.visible = false;
  scene.add(axesHelperObj);

  scene.add(measureGroup);

  if (toggleGridBtn) {
    toggleGridBtn.textContent = 'grid';
    toggleGridBtn.classList.toggle('active-tool', helperMode !== 'off');
    toggleGridBtn.addEventListener('click', cycleHelperMode);
  }

  modeSolidBtn.addEventListener('click', () => setShadingMode('solid'));
  modeEdgesBtn.addEventListener('click', () => setShadingMode('edges'));
  if (modeMeshBtn) modeMeshBtn.addEventListener('click', () => setShadingMode('mesh'));
  modeWireframeBtn.addEventListener('click', () => setShadingMode('wireframe'));

  toggleMeasureBtn.addEventListener('click', () => {
    isMeasuring = !isMeasuring;
    toggleMeasureBtn.classList.toggle('active-tool', isMeasuring);
    container.style.cursor = isMeasuring ? 'crosshair' : 'default';

    resetMeasurement();
    measureReadout.style.display = isMeasuring ? 'block' : 'none';
    if (isMeasuring) {
      measureReadout.innerHTML = 'Click point 1 (snaps to vertices).';
    }
  });

  container.addEventListener('pointerdown', onPointerDown);

  if (isoBtn) isoBtn.addEventListener('click', isoView);
  if (fitBtn && fitBtn !== isoBtn) fitBtn.addEventListener('click', isoView);
  if (fitBtn2 && fitBtn2 !== isoBtn) fitBtn2.addEventListener('click', isoView);
  if (toggleOrthoBtn) toggleOrthoBtn.addEventListener('click', toggleOrtho);
  if (toggleUpAxisBtn) {
    toggleUpAxisBtn.textContent = 'Z is up';
    toggleUpAxisBtn.addEventListener('click', toggleUpAxis);
  }

  window.addEventListener('resize', onResize);
  const ro = new ResizeObserver(() => {
    onResize();
  });
  ro.observe(container);

  initViewCube();
  animate();
}

function cycleHelperMode() {
  if (helperMode === 'grid') {
    helperMode = 'axes';
  } else if (helperMode === 'axes') {
    helperMode = 'off';
  } else {
    helperMode = 'grid';
  }

  if (gridHelperObj) gridHelperObj.visible = (helperMode === 'grid');
  if (axesHelperObj) axesHelperObj.visible = (helperMode === 'axes');

  if (toggleGridBtn) {
    toggleGridBtn.textContent = helperMode;
    toggleGridBtn.classList.toggle('active-tool', helperMode !== 'off');
  }
}

function makeTextPlane(text, colorHex, w = 18, h = 9) {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  ctx.font = 'normal 84px "Courier New", Courier, monospace';
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 256, 128);

  const texture = new THREE.CanvasTexture(canvas);
  texture.generateMipmaps = false;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;

  const mat = new THREE.MeshBasicMaterial({
    map: texture,
    color: 0x444444,
    transparent: true,
    opacity: 1.0,
    alphaTest: 0.1,
    depthTest: true,
    depthWrite: false,
    side: THREE.DoubleSide
  });
  const geo = new THREE.PlaneGeometry(w, h);
  return new THREE.Mesh(geo, mat);
}

let axesElements = [];

function createOpenScadAxes(maxRange = 400) {
  const group = new THREE.Group();
  const axisColor = 0x444444;
  const hexStr = '#444444';
  axesElements = [];

  const axesConfig = [
    {
      dir: new THREE.Vector3(1, 0, 0),
      tickDir: new THREE.Vector3(0, 1, 0),
      rot: new THREE.Euler(0, 0, 0),
      name: '+X'
    },
    {
      dir: new THREE.Vector3(0, 1, 0),
      tickDir: new THREE.Vector3(1, 0, 0),
      rot: new THREE.Euler(0, 0, Math.PI / 2),
      name: (upAxis === 'Y' ? '+Z' : '+Y')
    },
    {
      dir: new THREE.Vector3(0, 0, 1),
      tickDir: new THREE.Vector3(1, 0, 0),
      rot: new THREE.Euler(Math.PI / 2, 0, Math.PI / 2),
      name: (upAxis === 'Y' ? '+Y' : '+Z')
    }
  ];

  axesConfig.forEach(({ dir, tickDir, rot, name }) => {
    // Segments for positive axis: 0-100, 100-200, 200-400
    const ranges = [
      { min: 0, max: 100, reqRange: 100 },
      { min: 100, max: 200, reqRange: 200 },
      { min: 200, max: 400, reqRange: 400 }
    ];
    ranges.forEach(r => {
      const p1 = dir.clone().multiplyScalar(r.min);
      const p2 = dir.clone().multiplyScalar(r.max);
      const geo = new THREE.BufferGeometry().setFromPoints([p1, p2]);
      const mat = new THREE.LineBasicMaterial({
        color: axisColor,
        depthTest: true
      });
      const line = new THREE.Line(geo, mat);
      line.userData.reqRange = r.reqRange;
      group.add(line);
      axesElements.push(line);
    });

    // Segments for negative axis: 0 to -100, -100 to -200, -200 to -400
    ranges.forEach(r => {
      const p1 = dir.clone().multiplyScalar(-r.min);
      const p2 = dir.clone().multiplyScalar(-r.max);
      const geo = new THREE.BufferGeometry().setFromPoints([p1, p2]);
      const mat = new THREE.LineDashedMaterial({
        color: axisColor,
        dashSize: 3,
        gapSize: 2,
        depthTest: true
      });
      const line = new THREE.Line(geo, mat);
      line.computeLineDistances();
      line.userData.reqRange = r.reqRange;
      group.add(line);
      axesElements.push(line);
    });

    // End label (+X, +Y, +Z)
    const endLabel = makeTextPlane(name, hexStr, 14, 7);
    endLabel.rotation.copy(rot);
    endLabel.userData.isEndLabel = true;
    endLabel.userData.dir = dir.clone();
    endLabel.userData.planeHeight = 7;
    group.add(endLabel);
    axesElements.push(endLabel);

    // Ticks: 10s (small), 20s (large + number) up to maxRange
    for (let val = -maxRange; val <= maxRange; val += 10) {
      if (val === 0) continue;

      const absVal = Math.abs(val);
      const isMajor = (val % 20 === 0);
      const tickLen = isMajor ? 2.5 : 1.2;

      const pCenter = dir.clone().multiplyScalar(val);
      const p1 = pCenter.clone().add(tickDir.clone().multiplyScalar(-tickLen));
      const p2 = pCenter.clone().add(tickDir.clone().multiplyScalar(tickLen));

      const tickGeo = new THREE.BufferGeometry().setFromPoints([p1, p2]);
      const tickMat = new THREE.LineBasicMaterial({
        color: axisColor,
        depthTest: true
      });
      const tickLine = new THREE.Line(tickGeo, tickMat);
      tickLine.userData.val = val;
      tickLine.userData.absVal = absVal;
      tickLine.userData.isTick = true;
      tickLine.userData.isMajor = isMajor;
      group.add(tickLine);
      axesElements.push(tickLine);

      if (isMajor) {
        const numMesh = makeTextPlane(`${val}`, hexStr, 18, 9);
        numMesh.rotation.copy(rot);
        numMesh.userData.isNumber = true;
        numMesh.userData.val = val;
        numMesh.userData.absVal = absVal;
        numMesh.userData.worldPos = pCenter.clone();
        numMesh.userData.offsetDir = tickDir.clone();
        numMesh.userData.axisDir = dir.clone();
        numMesh.userData.tickLen = tickLen;
        numMesh.userData.planeHeight = 9;
        numMesh.userData.planeWidth = 18;
        group.add(numMesh);
        axesElements.push(numMesh);
      }
    }
  });

  return group;
}

export function getCurrentMesh() {
  return currentMesh;
}

export function getCustomModelColor() {
  return customModelColor;
}

export function setCustomModelColor(hex) {
  customModelColor = hex;
}

export function updateMeshColor(hex) {
  customModelColor = hex;
  if (currentMesh) {
    if (currentMesh.material) {
      currentMesh.material.color.set(hex);
    } else if (currentMesh.traverse) {
      currentMesh.traverse((child) => {
        if (child.isMesh && child.material) {
          child.material.color.set(hex);
        }
      });
    }
  }
}

export function setShadingMode(mode) {
  currentShadingMode = mode;
  modeSolidBtn.classList.toggle('active-mode', mode === 'solid');
  modeEdgesBtn.classList.toggle('active-mode', mode === 'edges');
  if (modeMeshBtn) modeMeshBtn.classList.toggle('active-mode', mode === 'mesh');
  modeWireframeBtn.classList.toggle('active-mode', mode === 'wireframe');

  if (!currentMesh) return;

  const isPureWire = (mode === 'wireframe');
  if (currentMesh.isMesh && currentMesh.material) {
    currentMesh.material.wireframe = isPureWire;
  } else if (currentMesh.traverse) {
    currentMesh.traverse((child) => {
      if (child.isMesh && child.material) {
        child.material.wireframe = isPureWire;
      }
    });
  }

  if (currentEdgesMesh) {
    currentEdgesMesh.visible = (mode === 'edges');
  }

  if (currentWireframeOverlay) {
    currentWireframeOverlay.visible = (mode === 'mesh');
  }
}

export function resetMeasurement() {
  measurePoints = [];
  while (measureGroup.children.length > 0) {
    const obj = measureGroup.children[0];
    measureGroup.remove(obj);
    if (obj.geometry) obj.geometry.dispose();
  }
}

function createSnapMarker(position) {
  const marker = new THREE.Group();

  const dotGeo = new THREE.SphereGeometry(0.4, 12, 12);
  const dotMat = new THREE.MeshBasicMaterial({ color: 0xffffff, depthTest: false });
  const dot = new THREE.Mesh(dotGeo, dotMat);
  dot.renderOrder = 999;
  marker.add(dot);

  const lineMat = new THREE.LineBasicMaterial({ color: 0xffffff, depthTest: false });
  const axes = [
    new THREE.Vector3(-1.5, 0, 0), new THREE.Vector3(1.5, 0, 0),
    new THREE.Vector3(0, -1.5, 0), new THREE.Vector3(0, 1.5, 0),
    new THREE.Vector3(0, 0, -1.5), new THREE.Vector3(0, 0, 1.5)
  ];
  const crossGeo = new THREE.BufferGeometry().setFromPoints(axes);
  const cross = new THREE.LineSegments(crossGeo, lineMat);
  cross.renderOrder = 999;
  marker.add(cross);

  marker.position.copy(position);
  return marker;
}

function getSnappedVertex(intersection) {
  const geom = intersection.object.geometry;
  const posAttr = geom.attributes.position;
  const hitPoint = intersection.point;

  let bestVertex = null;
  let minDistanceSq = Infinity;

  if (intersection.face) {
    const indices = [intersection.face.a, intersection.face.b, intersection.face.c];
    for (let idx of indices) {
      const v = new THREE.Vector3().fromBufferAttribute(posAttr, idx);
      intersection.object.localToWorld(v);
      const distSq = v.distanceToSquared(hitPoint);
      if (distSq < minDistanceSq) {
        minDistanceSq = distSq;
        bestVertex = v;
      }
    }
  }
  return bestVertex || hitPoint;
}

function onPointerDown(e) {
  if (!isMeasuring || !currentMesh) return;
  if (e.button !== 0) return;

  const rect = container.getBoundingClientRect();
  mouse.x = ((e.clientX - rect.left) / container.clientWidth) * 2 - 1;
  mouse.y = -((e.clientY - rect.top) / container.clientHeight) * 2 + 1;

  raycaster.setFromCamera(mouse, camera);
  const intersects = raycaster.intersectObject(currentMesh);

  if (intersects.length > 0) {
    const snapPos = getSnappedVertex(intersects[0]);

    if (measurePoints.length >= 2) {
      resetMeasurement();
    }

    measurePoints.push(snapPos);
    measureGroup.add(createSnapMarker(snapPos));

    if (measurePoints.length === 1) {
      if (upAxis === 'Y') {
        measureReadout.innerHTML = `
          Point 1 set:<br>
          <span style="color:#888;">X: ${snapPos.x.toFixed(2)} | Z: ${snapPos.y.toFixed(2)} | Y: ${snapPos.z.toFixed(2)}</span><br>
          Click point 2.
        `;
      } else {
        measureReadout.innerHTML = `
          Point 1 set:<br>
          <span style="color:#888;">X: ${snapPos.x.toFixed(2)} | Y: ${snapPos.y.toFixed(2)} | Z: ${snapPos.z.toFixed(2)}</span><br>
          Click point 2.
        `;
      }
    } else if (measurePoints.length === 2) {
      const p1 = measurePoints[0];
      const p2 = measurePoints[1];

      const lineGeo = new THREE.BufferGeometry().setFromPoints([p1, p2]);
      const lineMat = new THREE.LineBasicMaterial({ color: 0xffffff, linewidth: 2, depthTest: false });
      const line = new THREE.Line(lineGeo, lineMat);
      line.renderOrder = 998;
      measureGroup.add(line);

      const corner1 = new THREE.Vector3(p2.x, p1.y, p1.z);
      const corner2 = new THREE.Vector3(p2.x, p2.y, p1.z);

      function createAxisLine(from, to, colorHex) {
        const geo = new THREE.BufferGeometry().setFromPoints([from, to]);
        const mat = new THREE.LineDashedMaterial({ color: colorHex, dashSize: 1, gapSize: 0.8, depthTest: false });
        const l = new THREE.Line(geo, mat);
        l.computeLineDistances();
        l.renderOrder = 997;
        return l;
      }

      const dist = p1.distanceTo(p2);
      const dx = Math.abs(p2.x - p1.x);
      const dyWorld = Math.abs(p2.y - p1.y);
      const dzWorld = Math.abs(p2.z - p1.z);

      if (upAxis === 'Y') {
        // In Y-up: World Y is +Z (color 0x007aff blue), World Z is +Y (color 0x34c759 green)
        measureGroup.add(createAxisLine(p1, corner1, 0xff3b30));     // X
        measureGroup.add(createAxisLine(corner1, corner2, 0x007aff)); // Z axis (World Y)
        measureGroup.add(createAxisLine(corner2, p2, 0x34c759));      // Y axis (World Z)

        measureReadout.innerHTML = `
          <strong style="color:#ffffff; font-size:13px;">Distance: ${dist.toFixed(3)} mm</strong><br>
          <div style="margin-top:4px; border-top:1px solid #333333; padding-top:4px; font-family:monospace;">
            <span class="axis-x">ΔX:</span> ${dx.toFixed(3)} mm<br>
            <span class="axis-y" style="color:#34c759">ΔY:</span> ${dzWorld.toFixed(3)} mm<br>
            <span class="axis-z" style="color:#007aff">ΔZ:</span> ${dyWorld.toFixed(3)} mm
          </div>
          <div style="font-size:10px; color:#666666; margin-top:4px;">Click again to remeasure</div>
        `;
      } else {
        // In Z-up: World Y is +Y (green), World Z is +Z (blue)
        measureGroup.add(createAxisLine(p1, corner1, 0xff3b30));     // X
        measureGroup.add(createAxisLine(corner1, corner2, 0x34c759)); // Y
        measureGroup.add(createAxisLine(corner2, p2, 0x007aff));      // Z

        measureReadout.innerHTML = `
          <strong style="color:#ffffff; font-size:13px;">Distance: ${dist.toFixed(3)} mm</strong><br>
          <div style="margin-top:4px; border-top:1px solid #333333; padding-top:4px; font-family:monospace;">
            <span class="axis-x">ΔX:</span> ${dx.toFixed(3)} mm<br>
            <span class="axis-y" style="color:#34c759">ΔY:</span> ${dyWorld.toFixed(3)} mm<br>
            <span class="axis-z" style="color:#007aff">ΔZ:</span> ${dzWorld.toFixed(3)} mm
          </div>
          <div style="font-size:10px; color:#666666; margin-top:4px;">Click again to remeasure</div>
        `;
      }
    }
  }
}

export function clearScene() {
  if (currentMesh) {
    scene.remove(currentMesh);
    if (currentMesh.geometry) currentMesh.geometry.dispose();
    currentMesh = null;
  }
  if (currentEdgesMesh) {
    scene.remove(currentEdgesMesh);
    if (currentEdgesMesh.geometry) currentEdgesMesh.geometry.dispose();
    currentEdgesMesh = null;
  }
  if (currentWireframeOverlay) {
    scene.remove(currentWireframeOverlay);
    if (currentWireframeOverlay.geometry) currentWireframeOverlay.geometry.dispose();
    currentWireframeOverlay = null;
  }
  resetMeasurement();
}

export function displayGeometry(geometryOrGroup, isPreview = false, isMeshFile = false) {
  clearScene();
  isCurrentMeshFile = isMeshFile;

  const baseColor = 0xf9d72c;
  const meshColor = customModelColor ? customModelColor : baseColor;

  if (geometryOrGroup.isBufferGeometry) {
    const geometry = geometryOrGroup;
    geometry.computeVertexNormals();

    const material = new THREE.MeshLambertMaterial({
      color: meshColor,
      wireframe: (currentShadingMode === 'wireframe'),
      polygonOffset: true,
      polygonOffsetFactor: 1,
      polygonOffsetUnits: 1
    });
    currentMesh = new THREE.Mesh(geometry, material);
    scene.add(currentMesh);

    const edgesGeometry = new THREE.EdgesGeometry(geometry, 24);
    const edgesMaterial = new THREE.LineBasicMaterial({ color: 0x111111, linewidth: 1 });
    currentEdgesMesh = new THREE.LineSegments(edgesGeometry, edgesMaterial);
    currentEdgesMesh.visible = (currentShadingMode === 'edges');
    scene.add(currentEdgesMesh);

    const wireGeometry = new THREE.WireframeGeometry(geometry);
    const wireMaterial = new THREE.LineBasicMaterial({
      color: 0x000000,
      linewidth: 1,
      depthTest: true
    });
    currentWireframeOverlay = new THREE.LineSegments(wireGeometry, wireMaterial);
    currentWireframeOverlay.visible = (currentShadingMode === 'mesh');
    scene.add(currentWireframeOverlay);
  } else {
    const group = geometryOrGroup;
    currentMesh = group;

    const material = new THREE.MeshLambertMaterial({
      color: meshColor,
      wireframe: (currentShadingMode === 'wireframe'),
      polygonOffset: true,
      polygonOffsetFactor: 1,
      polygonOffsetUnits: 1
    });

    const allEdges = new THREE.Group();
    const allWire = new THREE.Group();
    group.traverse((child) => {
      if (child.isMesh && child.geometry) {
        child.geometry.computeVertexNormals();
        child.material = material;
        const edgesGeo = new THREE.EdgesGeometry(child.geometry, 24);
        const edgeMat = new THREE.LineBasicMaterial({ color: 0x111111, linewidth: 1 });
        const edgeSegs = new THREE.LineSegments(edgesGeo, edgeMat);
        allEdges.add(edgeSegs);

        const wireGeo = new THREE.WireframeGeometry(child.geometry);
        const wireMat = new THREE.LineBasicMaterial({
          color: 0x000000,
          linewidth: 1,
          depthTest: true
        });
        const wireSegs = new THREE.LineSegments(wireGeo, wireMat);
        allWire.add(wireSegs);
      }
    });

    scene.add(currentMesh);
    currentEdgesMesh = allEdges;
    currentEdgesMesh.visible = (currentShadingMode === 'edges');
    scene.add(currentEdgesMesh);

    currentWireframeOverlay = allWire;
    currentWireframeOverlay.visible = (currentShadingMode === 'mesh');
    scene.add(currentWireframeOverlay);
  }

  applyMeshTransformAndPlacement();
}

export function getModelCenter() {
  if (!currentMesh) return new THREE.Vector3();
  const box = new THREE.Box3().setFromObject(currentMesh);
  const center = new THREE.Vector3();
  box.getCenter(center);
  return center;
}

export function getModelRadius() {
  if (!currentMesh) return 80;
  const box = new THREE.Box3().setFromObject(currentMesh);
  const size = new THREE.Vector3();
  box.getSize(size);
  return size.length() * 0.7;
}

export function snapView(posVec) {
  const center = getModelCenter();
  const r = getModelRadius();
  const dir = posVec.clone().normalize();

  const isPureZ = Math.abs(dir.x) < 0.001 && Math.abs(dir.y) < 0.001;
  const upVec = isPureZ ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(0, 0, 1);

  perspCamera.up.copy(upVec);
  perspCamera.position.copy(center).addScaledVector(dir, r * 2.5);
  perspCamera.lookAt(center);

  orthoCamera.up.copy(upVec);
  orthoCamera.position.copy(center).addScaledVector(dir, r * 2.5);
  orthoCamera.lookAt(center);

  controls.target.copy(center);
  orthoControls.target.copy(center);
  const aspect = width() / height();
  orthoCamera.left = -r * aspect;
  orthoCamera.right = r * aspect;
  orthoCamera.top = r;
  orthoCamera.bottom = -r;
  orthoCamera.updateProjectionMatrix();

  controls.update();
  orthoControls.update();
}

export function isoView() {
  snapView(new THREE.Vector3(1, -1, 0.8));
}
export const fitView = isoView;

export function toggleOrtho() {
  isOrtho = !isOrtho;
  camera = isOrtho ? orthoCamera : perspCamera;
  controls.enabled = !isOrtho;
  orthoControls.enabled = isOrtho;
  toggleOrthoBtn.textContent = isOrtho ? 'orthographic' : 'perspective';

  if (isOrtho) {
    const center = controls.target.clone();
    const r = getModelRadius();
    orthoCamera.position.copy(perspCamera.position);
    orthoCamera.quaternion.copy(perspCamera.quaternion);
    const aspect = width() / height();
    orthoCamera.left = -r * aspect;
    orthoCamera.right = r * aspect;
    orthoCamera.top = r;
    orthoCamera.bottom = -r;
    orthoCamera.updateProjectionMatrix();
    orthoControls.target.copy(center);
    orthoControls.update();
  } else {
    perspCamera.position.copy(orthoCamera.position);
    perspCamera.quaternion.copy(orthoCamera.quaternion);
    controls.target.copy(orthoControls.target);
    controls.update();
  }
}

function applyMeshTransformAndPlacement() {
  if (!currentMesh) return;

  const meshes = [currentMesh, currentEdgesMesh, currentWireframeOverlay].filter(Boolean);

  meshes.forEach(m => {
    m.position.set(0, 0, 0);
    m.rotation.set(0, 0, 0);
    if (upAxis === 'Y') {
      m.rotation.x = Math.PI / 2;
    }
    m.updateMatrixWorld(true);
  });

  const box = new THREE.Box3().setFromObject(currentMesh);
  let center = new THREE.Vector3();
  box.getCenter(center);

  if (isCurrentMeshFile && isFinite(box.min.z)) {
    const offsetZ = -box.min.z;
    meshes.forEach(m => {
      m.position.z += offsetZ;
      m.updateMatrixWorld(true);
    });
    center.z += offsetZ;
  }

  controls.target.copy(center);
  orthoControls.target.copy(center);
  controls.update();
  orthoControls.update();
}

export function toggleUpAxis() {
  upAxis = (upAxis === 'Z') ? 'Y' : 'Z';
  if (toggleUpAxisBtn) {
    toggleUpAxisBtn.textContent = `${upAxis} is up`;
  }
  applyMeshTransformAndPlacement();
  resetMeasurement();
  updateViewCubeAndAxesForUpAxis();
}

function updateScaleIndicator() {
  if (!scaleBar || !scaleLabel) return;
  const fov = perspCamera.fov * Math.PI / 180;
  const dist = camera.position.distanceTo(controls.target);
  const viewHeight = 2 * Math.tan(fov / 2) * dist;
  const pixelsPerMm = height() / viewHeight;
  const targetBarPx = 80;
  const mmRaw = targetBarPx / pixelsPerMm;
  const niceSteps = [0.1, 0.2, 0.5, 1, 2, 5, 10, 20, 50, 100, 200, 500, 1000];
  let niceMm = niceSteps[niceSteps.length - 1];
  for (const s of niceSteps) { if (s >= mmRaw) { niceMm = s; break; } }
  const barPx = Math.round(niceMm * pixelsPerMm);
  scaleBar.style.width = barPx + 'px';
  scaleLabel.textContent = niceMm >= 10 ? (niceMm / 10).toFixed(0) + ' cm' : niceMm + ' mm';
}

export function onResize() {
  if (!container) return;
  perspCamera.aspect = width() / height();
  perspCamera.updateProjectionMatrix();
  const aspect = width() / height();
  const r = getModelRadius();
  orthoCamera.left = -r * aspect;
  orthoCamera.right = r * aspect;
  orthoCamera.top = r;
  orthoCamera.bottom = -r;
  orthoCamera.updateProjectionMatrix();
  renderer.setSize(width(), height());
}

function updateAxesTextScaling() {
  if (!axesHelperObj || !axesHelperObj.visible || axesElements.length === 0) return;

  let viewHeight = 200;
  if (isOrtho) {
    const zoom = orthoCamera.zoom || 1.0;
    viewHeight = (orthoCamera.top - orthoCamera.bottom) / zoom;
  } else {
    const dist = camera.position.distanceTo(controls.target);
    const fov = perspCamera.fov * Math.PI / 180;
    viewHeight = 2 * Math.tan(fov / 2) * dist;
  }

  // Active axis range based on camera distance / zoom (100 -> 200 -> 400)
  let activeRange = 100;
  if (viewHeight > 350) {
    activeRange = 400;
  } else if (viewHeight > 180) {
    activeRange = 200;
  }

  // Visual text size relative to screen
  const scaleFactor = Math.max(0.2, Math.min(viewHeight / 95.0, 5.0));

  // Determine tick & label step interval
  let numStep = 20;
  let showMinorTicks = true;
  if (viewHeight > 500) {
    numStep = 100;
    showMinorTicks = false;
  } else if (viewHeight > 250) {
    numStep = 40;
    showMinorTicks = false;
  }

  for (let i = 0; i < axesElements.length; i++) {
    const el = axesElements[i];

    // Axis line segments
    if (el.userData.reqRange !== undefined) {
      el.visible = (el.userData.reqRange <= activeRange);
      continue;
    }

    // End labels (+X, +Y, +Z)
    if (el.userData.isEndLabel) {
      el.visible = true;
      el.scale.set(scaleFactor, scaleFactor, 1);
      const endOffset = activeRange + 4 * scaleFactor;
      el.position.copy(el.userData.dir).multiplyScalar(endOffset);
      continue;
    }

    // Ticks
    if (el.userData.isTick) {
      if (el.userData.absVal > activeRange) {
        el.visible = false;
        continue;
      }
      if (!el.userData.isMajor && !showMinorTicks) {
        el.visible = false;
        continue;
      }
      el.visible = true;
      continue;
    }

    // Number text meshes
    if (el.userData.isNumber) {
      if (el.userData.absVal > activeRange || (el.userData.val % numStep !== 0)) {
        el.visible = false;
        continue;
      }

      el.visible = true;
      el.scale.set(scaleFactor, scaleFactor, 1);

      const tickLen = el.userData.tickLen || 2.5;
      const textHalf = (el.userData.planeHeight || 7) * 0.4 * scaleFactor;
      const currentOffset = tickLen + textHalf;
      
      // Center the numeric digits on the tick by offsetting the minus sign
      let pos = el.userData.worldPos.clone().addScaledVector(el.userData.offsetDir, currentOffset);
      if (el.userData.val < 0 && el.userData.axisDir) {
        // Half of a monospace character width in plane units scaled
        const charWidthPlane = (el.userData.planeWidth / 6.0) * scaleFactor;
        pos.addScaledVector(el.userData.axisDir, -charWidthPlane * 0.5);
      }
      el.position.copy(pos);
    }
  }
}

function animate() {
  requestAnimationFrame(animate);
  if (isOrtho) {
    orthoControls.update();
  } else {
    controls.update();
  }
  updateAxesTextScaling();
  renderer.render(scene, camera);
  updateScaleIndicator();
}

function initViewCube() {
  const vc = document.getElementById('viewcube-canvas');
  if (!vc) return;
  const S = 140;

  const vcRenderer = new THREE.WebGLRenderer({ canvas: vc, antialias: true, alpha: true });
  vcRenderer.setPixelRatio(window.devicePixelRatio);
  vcRenderer.setSize(S, S);
  vcRenderer.setClearColor(0x000000, 0);

  const vcScene = new THREE.Scene();
  const vcPerspCamera = new THREE.PerspectiveCamera(12, 1, 0.1, 100);
  vcPerspCamera.up.set(0, 0, 1);
  const vcOrthoCamera = new THREE.OrthographicCamera(-1.52, 1.52, 1.52, -1.52, 0.1, 100);
  vcOrthoCamera.up.set(0, 0, 1);
  const getVcCamera = () => (isOrtho ? vcOrthoCamera : vcPerspCamera);

  const cubeGeo = new THREE.BoxGeometry(1.6, 1.6, 1.6);
  const cubeMat = new THREE.MeshBasicMaterial({
    color: 0x2e2e2e,
    polygonOffset: true,
    polygonOffsetFactor: 1,
    polygonOffsetUnits: 1,
  });
  const cubeMesh = new THREE.Mesh(cubeGeo, cubeMat);
  vcScene.add(cubeMesh);

  const cubeEdges = new THREE.LineSegments(
    new THREE.EdgesGeometry(cubeGeo),
    new THREE.LineBasicMaterial({
      color: 0x181818,
      linewidth: 3,
      transparent: true,
    })
  );
  cubeEdges.scale.set(1.0005, 1.0005, 1.0005);
  cubeEdges.renderOrder = 999;
  vcScene.add(cubeEdges);

  vcScene.add(new THREE.AmbientLight(0xffffff, 0.7));
  const vcDir = new THREE.DirectionalLight(0xffffff, 0.6);
  vcDir.position.set(5, -5, 8);
  vcScene.add(vcDir);

  function makeLabel(text, fg = '#ffffff', bg = '#2e2e2e') {
    const c = document.createElement('canvas');
    c.width = 256;
    c.height = 256;
    const ctx = c.getContext('2d');
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';

    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, 256, 256);

    const fontSize = text === 'BOTTOM' ? 52 : (text === 'TOP' ? 76 : 64);
    ctx.font = `700 ${fontSize}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;
    ctx.fillStyle = fg;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, 128, 128);

    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.generateMipmaps = true;
    tex.minFilter = THREE.LinearMipmapLinearFilter;
    tex.magFilter = THREE.LinearFilter;
    tex.anisotropy = vcRenderer.capabilities.getMaxAnisotropy();
    return tex;
  }

  const faceData = [
    { label: 'TOP', dir: new THREE.Vector3(0, 0, 1), up: new THREE.Vector3(0, 1, 0) },
    { label: 'BOTTOM', dir: new THREE.Vector3(0, 0, -1), up: new THREE.Vector3(0, -1, 0) },
    { label: 'FRONT', dir: new THREE.Vector3(0, -1, 0), up: new THREE.Vector3(0, 0, 1) },
    { label: 'BACK', dir: new THREE.Vector3(0, 1, 0), up: new THREE.Vector3(0, 0, 1) },
    { label: 'RIGHT', dir: new THREE.Vector3(1, 0, 0), up: new THREE.Vector3(0, 0, 1) },
    { label: 'LEFT', dir: new THREE.Vector3(-1, 0, 0), up: new THREE.Vector3(0, 0, 1) },
  ];

  const facePlanes = [];
  faceData.forEach(({ label, dir, up: upVec }) => {
    const geo = new THREE.PlaneGeometry(1.16, 1.16);
    const normalTex = makeLabel(label, '#ffffff', '#2e2e2e');
    const hoverTex = makeLabel(label, '#141414', '#f09c2a');
    const mat = new THREE.MeshBasicMaterial({ map: normalTex, side: THREE.FrontSide });
    const mesh = new THREE.Mesh(geo, mat);

    const normal = dir.clone().normalize();
    const up = upVec.clone().normalize();
    const right = new THREE.Vector3().crossVectors(up, normal).normalize();
    const matrix = new THREE.Matrix4().makeBasis(right, up, normal);
    mesh.quaternion.setFromRotationMatrix(matrix);
    mesh.position.copy(normal.clone().multiplyScalar(0.801));

    mesh.userData.snapDir = dir;
    mesh.userData.normalTex = normalTex;
    mesh.userData.hoverTex = hoverTex;
    vcScene.add(mesh);
    facePlanes.push(mesh);
  });

  const hitMat = new THREE.MeshBasicMaterial({
    color: 0xf09c2a,
    transparent: true,
    opacity: 0,
    depthWrite: false,
  });

  const hitBorderMat = new THREE.LineBasicMaterial({
    color: 0x181818,
    linewidth: 3,
    depthTest: true,
    depthWrite: false,
    transparent: true,
  });

  function addHitBorder(mesh, geo) {
    const lines = new THREE.LineSegments(new THREE.EdgesGeometry(geo), hitBorderMat);
    lines.position.copy(mesh.position);
    lines.renderOrder = 20;
    lines.visible = false;
    vcScene.add(lines);
    mesh.userData.borderLines = lines;
  }

  const cornerMeshes = [];
  const cornerGeo = new THREE.BoxGeometry(0.22, 0.22, 0.22);
  [-1, 1].forEach(x => {
    [-1, 1].forEach(y => {
      [-1, 1].forEach(z => {
        const cMesh = new THREE.Mesh(cornerGeo, hitMat.clone());
        cMesh.position.set(x * 0.691, y * 0.691, z * 0.691);
        cMesh.scale.set(0.992, 0.992, 0.992);
        cMesh.renderOrder = 10;
        cMesh.userData.snapDir = new THREE.Vector3(x, y, z).normalize();
        cMesh.userData.isHitBox = true;
        addHitBorder(cMesh, cornerGeo);
        vcScene.add(cMesh);
        cornerMeshes.push(cMesh);
      });
    });
  });

  const edgeMeshes = [];
  const edgeXGeo = new THREE.BoxGeometry(1.16, 0.22, 0.22);
  const edgeYGeo = new THREE.BoxGeometry(0.22, 1.16, 0.22);
  const edgeZGeo = new THREE.BoxGeometry(0.22, 0.22, 1.16);

  [-1, 1].forEach(y => {
    [-1, 1].forEach(z => {
      const eMesh = new THREE.Mesh(edgeXGeo, hitMat.clone());
      eMesh.position.set(0, y * 0.691, z * 0.691);
      eMesh.scale.set(0.992, 0.992, 0.992);
      eMesh.renderOrder = 10;
      eMesh.userData.snapDir = new THREE.Vector3(0, y, z).normalize();
      eMesh.userData.isHitBox = true;
      addHitBorder(eMesh, edgeXGeo);
      vcScene.add(eMesh);
      edgeMeshes.push(eMesh);
    });
  });
  [-1, 1].forEach(x => {
    [-1, 1].forEach(z => {
      const eMesh = new THREE.Mesh(edgeYGeo, hitMat.clone());
      eMesh.position.set(x * 0.691, 0, z * 0.691);
      eMesh.scale.set(0.992, 0.992, 0.992);
      eMesh.renderOrder = 10;
      eMesh.userData.snapDir = new THREE.Vector3(x, 0, z).normalize();
      eMesh.userData.isHitBox = true;
      addHitBorder(eMesh, edgeYGeo);
      vcScene.add(eMesh);
      edgeMeshes.push(eMesh);
    });
  });
  [-1, 1].forEach(x => {
    [-1, 1].forEach(y => {
      const eMesh = new THREE.Mesh(edgeZGeo, hitMat.clone());
      eMesh.position.set(x * 0.691, y * 0.691, 0);
      eMesh.scale.set(0.992, 0.992, 0.992);
      eMesh.renderOrder = 10;
      eMesh.userData.snapDir = new THREE.Vector3(x, y, 0).normalize();
      eMesh.userData.isHitBox = true;
      addHitBorder(eMesh, edgeZGeo);
      vcScene.add(eMesh);
      edgeMeshes.push(eMesh);
    });
  });

  const interactiveObjects = [...cornerMeshes, ...edgeMeshes, ...facePlanes];

  const vcMiniAxes = [];
  const axes = [
    { from: [0, 0, 0], to: [1.25, 0, 0], color: 0xff3b30, id: 'X' },
    { from: [0, 0, 0], to: [0, -1.25, 0], color: 0x34c759, id: 'Y' },
    { from: [0, 0, 0], to: [0, 0, 1.25], color: 0x007aff, id: 'Z' },
  ];
  axes.forEach(({ from, to, color, id }) => {
    const geo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(...from), new THREE.Vector3(...to)]);
    const mat = new THREE.LineBasicMaterial({ color, linewidth: 3, depthTest: false, transparent: true });
    const line = new THREE.Line(geo, mat);
    line.renderOrder = 9999;
    line.userData.axisId = id;
    vcScene.add(line);
    vcMiniAxes.push(line);
  });

  const vcRaycaster = new THREE.Raycaster();
  vc.addEventListener('click', (e) => {
    const rect = vc.getBoundingClientRect();
    const mx = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    const my = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    vcRaycaster.setFromCamera(new THREE.Vector2(mx, my), getVcCamera());
    const hits = vcRaycaster.intersectObjects(interactiveObjects, false);
    if (hits.length > 0 && hits[0].object.userData.snapDir) {
      const dir = hits[0].object.userData.snapDir;
      snapView(dir);
    }
  });

  let hoveredObj = null;
  vc.addEventListener('mousemove', (e) => {
    const rect = vc.getBoundingClientRect();
    const mx = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    const my = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    vcRaycaster.setFromCamera(new THREE.Vector2(mx, my), getVcCamera());
    const hits = vcRaycaster.intersectObjects(interactiveObjects, false);

    if (hoveredObj && (!hits.length || hits[0].object !== hoveredObj)) {
      if (hoveredObj.userData.isHitBox) {
        hoveredObj.material.opacity = 0;
        if (hoveredObj.userData.borderLines) {
          hoveredObj.userData.borderLines.visible = false;
        }
      } else {
        hoveredObj.material.map = hoveredObj.userData.normalTex;
        hoveredObj.material.needsUpdate = true;
      }
      hoveredObj = null;
    }

    if (hits.length > 0) {
      hoveredObj = hits[0].object;
      if (hoveredObj.userData.isHitBox) {
        hoveredObj.material.opacity = 1;
        if (hoveredObj.userData.borderLines) {
          hoveredObj.userData.borderLines.visible = true;
        }
      } else {
        hoveredObj.material.map = hoveredObj.userData.hoverTex;
        hoveredObj.material.needsUpdate = true;
      }
      vc.style.cursor = 'pointer';
    } else {
      vc.style.cursor = 'default';
    }
  });

  vc.addEventListener('mouseleave', () => {
    if (hoveredObj) {
      if (hoveredObj.userData.isHitBox) {
        hoveredObj.material.opacity = 0;
        if (hoveredObj.userData.borderLines) {
          hoveredObj.userData.borderLines.visible = false;
        }
      } else {
        hoveredObj.material.map = hoveredObj.userData.normalTex;
        hoveredObj.material.needsUpdate = true;
      }
      hoveredObj = null;
    }
    vc.style.cursor = 'default';
  });

  const arrowUp = document.getElementById('vc-arrow-up');
  const arrowDown = document.getElementById('vc-arrow-down');
  const arrowLeft = document.getElementById('vc-arrow-left');
  const arrowRight = document.getElementById('vc-arrow-right');

  function rotateStep(horiz, vert) {
    const curDir = new THREE.Vector3();
    camera.getWorldDirection(curDir);
    curDir.negate().normalize();
    const up = camera.up.clone().normalize();
    const right = new THREE.Vector3().crossVectors(curDir, up).normalize();

    let newDir = curDir.clone();
    if (horiz === 1) newDir.copy(right).negate();
    else if (horiz === -1) newDir.copy(right);
    else if (vert === 1) newDir.copy(up);
    else if (vert === -1) newDir.copy(up).negate();

    snapView(newDir);
  }

  if (arrowUp) arrowUp.addEventListener('click', () => rotateStep(0, 1));
  if (arrowDown) arrowDown.addEventListener('click', () => rotateStep(0, -1));
  if (arrowLeft) arrowLeft.addEventListener('click', () => rotateStep(-1, 0));
  if (arrowRight) arrowRight.addEventListener('click', () => rotateStep(1, 0));

  function animateVc() {
    requestAnimationFrame(animateVc);
    const activeCam = getVcCamera();
    const mainDir = new THREE.Vector3();
    camera.getWorldDirection(mainDir);
    activeCam.position.copy(mainDir.negate().multiplyScalar(14.46));
    activeCam.up.copy(camera.up);
    activeCam.lookAt(0, 0, 0);
    vcRenderer.render(vcScene, activeCam);
  }
  updateViewCubeAndAxesForUpAxis = function() {
    // Recreate openSCAD axes
    if (axesHelperObj) {
      const wasVisible = axesHelperObj.visible;
      scene.remove(axesHelperObj);
      axesHelperObj = createOpenScadAxes(400);
      axesHelperObj.visible = wasVisible;
      scene.add(axesHelperObj);
    }

    // Update mini axes colors on viewcube
    vcMiniAxes.forEach(line => {
      if (line.userData.axisId === 'X') {
        line.material.color.setHex(0xff3b30);
      } else if (line.userData.axisId === 'Y') {
        line.material.color.setHex(upAxis === 'Y' ? 0x007aff : 0x34c759);
      } else if (line.userData.axisId === 'Z') {
        line.material.color.setHex(upAxis === 'Y' ? 0x34c759 : 0x007aff);
      }
    });
  };

  animateVc();
}
