// Main JS for Generative 3D Art Tool
// ...initial setup...
let scene, camera, renderer, gui;
let shapeParams = {
  type: 'Circle',
  corners: 5,
  path: 'Line',
  instances: 10,
  scaleAnim: false,
  rotateAnim: false,
  cameraAngle: 'Fixed', // Default to Fixed
  distance: 0.5, // Default distance between instances
  cameraZoom: 2, // Default camera zoom (2 = default)
};
let shapePositions = []; // Store positions for camera centering
let outlines = []; // Track outline objects for proper cleanup

function init() {
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
  camera.position.set(0, 0, 50);

  renderer = new THREE.WebGLRenderer({ preserveDrawingBuffer: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  document.getElementById('container').appendChild(renderer.domElement);

  // dat.GUI setup
  gui = new dat.GUI();
  gui.add(shapeParams, 'type', ['Circle', 'Triangle', 'Square', 'Polygon']).name('Shape').onChange(updateShapes);
  gui.add(shapeParams, 'corners', 3, 12, 1).name('Polygon Corners').onChange(updateShapes);
  gui.add(shapeParams, 'path', ['Line', 'Curve', 'Spiral']).name('Path').onChange(updateShapes);
  gui.add(shapeParams, 'instances', 2, 50, 1).name('Instances').onChange(updateShapes);
  gui.add(shapeParams, 'distance', 0.5, 2, 0.01).name('Distance').onChange(updateShapes);
  gui.add(shapeParams, 'cameraZoom', 2, 4, 0.01).name('Camera Zoom').onChange(updateCamera);
  gui.add(shapeParams, 'scaleAnim').name('Scale Animation');
  gui.add(shapeParams, 'rotateAnim').name('Rotate Animation');
  gui.add(shapeParams, 'cameraAngle', ['Orbit', 'Fixed']).name('Camera').onChange(updateCamera);

  // Mouse drag rotation setup
  setupDragRotation();

  updateShapes();
  updateCamera();
  animate();
}
// Mouse drag rotation for the whole path/group
let isDragging = false;
let prevMouse = { x: 0, y: 0 };
let rotationDelta = { x: 0, y: 0 };
let pathGroup = null;

function setupDragRotation() {
  const container = document.getElementById('container');
  container.addEventListener('mousedown', (e) => {
    isDragging = true;
    prevMouse.x = e.clientX;
    prevMouse.y = e.clientY;
  });
  window.addEventListener('mousemove', (e) => {
    if (!isDragging) return;
    const dx = e.clientX - prevMouse.x;
    const dy = e.clientY - prevMouse.y;
    rotationDelta.x += dy * 0.01; // vertical drag = X axis rotation
    rotationDelta.y += dx * 0.01; // horizontal drag = Y axis rotation
    prevMouse.x = e.clientX;
    prevMouse.y = e.clientY;
  });
  window.addEventListener('mouseup', () => {
    isDragging = false;
  });
}

function clearShapes() {
  // Remove previous outlines from scene
  if (pathGroup) {
    scene.remove(pathGroup);
    pathGroup = null;
  }
  outlines = [];
}

function createShapeMesh(type, corners) {
  let geometry;
  switch (type) {
    case 'Circle':
      geometry = new THREE.CircleGeometry(2, 64);
      break;
    case 'Triangle':
      geometry = new THREE.CircleGeometry(2, 3);
      break;
    case 'Square':
      geometry = new THREE.BoxGeometry(4, 4, 0.1);
      geometry.translate(0, 0, 0); // Centered by default
      break;
    case 'Polygon':
      geometry = new THREE.CircleGeometry(2, corners);
      break;
    default:
      geometry = new THREE.CircleGeometry(2, 64);
  }
  // Ensure geometry is centered
  geometry.computeBoundingBox();
  const center = geometry.boundingBox.getCenter(new THREE.Vector3());
  geometry.translate(-center.x, -center.y, -center.z);
  // No mesh or wireframe material needed
  return geometry;
}

// Place shapes so they overlap along the path
function getPathPosition(pathType, i, total) {
  const spacing = shapeParams.distance;
  if (pathType === 'Line') {
    // Diagonal line
    return new THREE.Vector3(-spacing * (total - 1) / 2 + spacing * i, -spacing * (total - 1) / 2 + spacing * i, 0);
  } else if (pathType === 'Curve') {
    const t = i / (total - 1);
    const p0 = new THREE.Vector3(-spacing * (total - 1) / 2, 0, 0);
    const p1 = new THREE.Vector3(0, spacing * (total - 1) / 2, 0);
    const p2 = new THREE.Vector3(spacing * (total - 1) / 2, 0, 0);
    const x = (1 - t) * (1 - t) * p0.x + 2 * (1 - t) * t * p1.x + t * t * p2.x;
    const y = (1 - t) * (1 - t) * p0.y + 2 * (1 - t) * t * p1.y + t * t * p2.y;
    return new THREE.Vector3(x, y, 0);
  } else if (pathType === 'Spiral') {
    const t = i / (total - 1);
    const angle = t * Math.PI * 4;
    const radius = 5 + spacing * t * (total - 1) / 2;
    return new THREE.Vector3(Math.cos(angle) * radius, Math.sin(angle) * radius, 0);
  }
  return new THREE.Vector3(0, 0, 0);
}

function updateShapes() {
  clearShapes();
  shapePositions = [];
  pathGroup = new THREE.Group();
  // First, collect all positions
  for (let i = 0; i < shapeParams.instances; i++) {
    const pos = getPathPosition(shapeParams.path, i, shapeParams.instances);
    shapePositions.push(pos.clone());
  }
  // Calculate centroid
  let center = new THREE.Vector3(0, 0, 0);
  if (shapePositions.length > 0) {
    for (let p of shapePositions) center.add(p);
    center.multiplyScalar(1 / shapePositions.length);
  }
  // Now create shapes, offsetting by centroid
  for (let i = 0; i < shapeParams.instances; i++) {
    const geometry = createShapeMesh(shapeParams.type, shapeParams.corners);
    const pos = shapePositions[i].clone().sub(center); // Centered

    // Calculate tangent direction for orientation (3D)
    let tangent;
    const total = shapeParams.instances;
    if (i === 0 && total > 1) {
      // First shape: tangent toward next shape
      const nextPos = shapePositions[i + 1].clone().sub(center);
      tangent = new THREE.Vector3().subVectors(nextPos, pos).normalize();
    } else if (i === total - 1 && total > 1) {
      // Last shape: tangent from previous shape
      const prevPos = shapePositions[i - 1].clone().sub(center);
      tangent = new THREE.Vector3().subVectors(pos, prevPos).normalize();
    } else if (total > 1) {
      // Middle shapes: tangent toward next shape
      const nextPos = shapePositions[i + 1].clone().sub(center);
      tangent = new THREE.Vector3().subVectors(nextPos, pos).normalize();
    } else {
      // Only one shape: default tangent
      tangent = new THREE.Vector3(0, 1, 0);
    }
    // Orient shape so its Z axis points along the tangent
    const lookTarget = new THREE.Vector3().addVectors(pos, tangent);
    // For outline, create LineLoop only
    let outline;
    if (shapeParams.type === 'Square') {
      const squareOutlineGeom = new THREE.BufferGeometry();
      const verts = [
        [-2, -2, 0],
        [2, -2, 0],
        [2, 2, 0],
        [-2, 2, 0],
        [-2, -2, 0],
      ];
      squareOutlineGeom.setAttribute('position', new THREE.Float32BufferAttribute(verts.flat(), 3));
      outline = new THREE.LineLoop(squareOutlineGeom, new THREE.LineBasicMaterial({ color: 0xffffff }));
      outline.position.copy(pos);
      outline.lookAt(lookTarget);
      pathGroup.add(outline);
      outlines.push(outline);
    } else {
      // Extract only perimeter vertices for outline
      let perimeterPositions = [];
      if (geometry.type === 'CircleGeometry') {
        // CircleGeometry: perimeter vertices are the last segmentCount vertices
        const posAttr = geometry.getAttribute('position');
        const segCount = geometry.parameters.segments || shapeParams.corners || 64;
        // The perimeter vertices start at index 1 (skip center vertex)
        for (let j = 1; j <= segCount; j++) {
          const x = posAttr.getX(j);
          const y = posAttr.getY(j);
          const z = posAttr.getZ(j);
          perimeterPositions.push(x, y, z);
        }
        // Close the loop by repeating the first perimeter vertex
        const x0 = posAttr.getX(1);
        const y0 = posAttr.getY(1);
        const z0 = posAttr.getZ(1);
        perimeterPositions.push(x0, y0, z0);
      } else if (geometry.type === 'BoxGeometry') {
        // For box, use square logic (shouldn't happen, but fallback)
        perimeterPositions = [-2, -2, 0, 2, -2, 0, 2, 2, 0, -2, 2, 0, -2, -2, 0];
      } else {
        // For other polygons, treat as circle perimeter
        const posAttr = geometry.getAttribute('position');
        const segCount = geometry.parameters.segments || shapeParams.corners || 64;
        for (let j = 1; j <= segCount; j++) {
          const x = posAttr.getX(j);
          const y = posAttr.getY(j);
          const z = posAttr.getZ(j);
          perimeterPositions.push(x, y, z);
        }
        const x0 = posAttr.getX(1);
        const y0 = posAttr.getY(1);
        const z0 = posAttr.getZ(1);
        perimeterPositions.push(x0, y0, z0);
      }
      const outlineGeom = new THREE.BufferGeometry();
      outlineGeom.setAttribute('position', new THREE.Float32BufferAttribute(perimeterPositions, 3));
      outline = new THREE.LineLoop(outlineGeom, new THREE.LineBasicMaterial({ color: 0xffffff }));
      outline.position.copy(pos);
      outline.lookAt(lookTarget);
      pathGroup.add(outline);
      outlines.push(outline);
    }
    // Only outline is added, no mesh
  }
  scene.add(pathGroup);
}

function updateCamera() {
  // Calculate centroid of all shapes
  let center = new THREE.Vector3(0, 0, 0);
  if (shapePositions.length > 0) {
    for (let p of shapePositions) center.add(p);
    center.multiplyScalar(1 / shapePositions.length);
  }
  // Camera zoom logic
  let zoom = shapeParams.cameraZoom;
  if (shapeParams.cameraAngle === 'Orbit') {
    camera.position.set(center.x, center.y, center.z + 25 / zoom);
    camera.lookAt(center);
  } else {
    // True isometric view: 35.264° above XY, 45° around Z, and closer
    const isoDist = 18 / zoom;
    const angle = Math.PI / 4; // 45°
    const elev = Math.atan(Math.sqrt(2)); // ≈ 54.735° from Z, 35.264° from XY
    camera.position.x = center.x + isoDist * Math.cos(angle);
    camera.position.y = center.y + isoDist * Math.sin(angle);
    camera.position.z = center.z + isoDist * Math.sin(elev);
    camera.lookAt(center);
  }
}

function animate() {
  requestAnimationFrame(animate);
  // Animation presets
  for (let outline of outlines) {
    if (shapeParams.scaleAnim) {
      outline.scale.setScalar(1 + 0.3 * Math.sin(Date.now() * 0.002 + outline.position.x));
    } else {
      outline.scale.setScalar(1);
    }
    if (shapeParams.rotateAnim) {
      outline.rotation.z += 0.01;
    }
  }
  // Apply drag rotation to the whole path group
  if (pathGroup) {
    pathGroup.rotation.x = rotationDelta.x;
    pathGroup.rotation.y = rotationDelta.y;
  }

  // Camera orbit animation
  if (shapeParams.cameraAngle === 'Orbit') {
    const time = Date.now() * 0.001;
    const zoom = shapeParams.cameraZoom;
    const radius = 25 / zoom;
    let center = new THREE.Vector3(0, 0, 0);
    if (shapePositions.length > 0) {
      for (let p of shapePositions) center.add(p);
      center.multiplyScalar(1 / shapePositions.length);
    }
    camera.position.x = center.x + Math.cos(time) * radius;
    camera.position.y = center.y + Math.sin(time) * radius;
    camera.position.z = center.z + 15 / zoom + 5 * Math.sin(time * 0.5);
    camera.lookAt(center);
  }

  renderer.render(scene, camera);
}

window.onload = init;

// Export PNG
const exportBtn = document.getElementById('exportBtn');
if (exportBtn) {
  exportBtn.onclick = function () {
    const dataURL = renderer.domElement.toDataURL('image/png');
    const link = document.createElement('a');
    link.download = 'art.png';
    link.href = dataURL;
    link.click();
  };
}
