// Main JS for Generative 3D Art Tool
// ...initial setup...
let scene, camera, renderer, gui;
let shapeParams = {
  type: 'Circle',
  corners: 5,
  path: 'Line',
  instances: 10,
  length: 4, // Default length (diameter for circle, side for square, etc.)
  width: 2, // Default width
  scaleAnim: false,
  rotateAnim: false,
  cameraAngle: 'Fixed', // Default to Fixed
  distance: 0.5, // Default distance between instances
  cameraZoom: 2, // Default camera zoom (2 = default)
  invertColors: false, // Option to invert colors
  fillShapes: true, // Option to fill shapes
  kaleidoscope: false, // Kaleidoscope mode
  kaleidoscopeSegments: 6, // Number of segments for kaleidoscope
};
let shapePositions = []; // Store positions for camera centering
let outlines = []; // Track outline objects for proper cleanup
let meshes = []; // Track filled mesh objects for animation

function init() {
  // dat.GUI setup
  gui = new dat.GUI();
  // Add all controls to the same pane
  shapeParams.export = function() {
    const dataURL = renderer.domElement.toDataURL('image/png');
    const link = document.createElement('a');
    link.download = 'art.png';
    link.href = dataURL;
    link.click();
  };
  gui.add(shapeParams, 'export').name('Export PNG');
  const shapeController = gui.add(shapeParams, 'type', ['Circle', 'Square', 'Polygon']).name('Shape').onChange(function(value) {
    updateShapes();
    // Show/hide corners controller based on shape selection
    if (value === 'Polygon') {
      cornersController.domElement.parentElement.style.display = '';
    } else {
      cornersController.domElement.parentElement.style.display = 'none';
    }
  });
  const cornersController = gui.add(shapeParams, 'corners', 3, 12, 1).name('Polygon Corners').onChange(updateShapes);
  
  // Hide corners controller initially if not Polygon
  if (shapeParams.type !== 'Polygon') {
    cornersController.domElement.parentElement.style.display = 'none';
  }
  const lengthController = gui.add(shapeParams, 'length', 0.1, 10, 0.1).name('Length').onChange(updateShapes);
  const widthController = gui.add(shapeParams, 'width', 0.1, 10, 0.1).name('Width').onChange(updateShapes);
  gui.add(shapeParams, 'fillShapes').name('Fill Shapes').onChange(updateShapes);
  gui.add(shapeParams, 'kaleidoscope').name('Kaleidoscope').onChange(updateShapes);
  gui.add(shapeParams, 'kaleidoscopeSegments', 2, 24, 1).name('Kaleidoscope Segments').onChange(updateShapes);
    gui.add(shapeParams, 'scaleAnim').name('Scale Animation');
  gui.add(shapeParams, 'rotateAnim').name('Rotate Animation');
  
  gui.add(shapeParams, 'path', ['Line', 'Circle']).name('Path').onChange(updateShapes);
  gui.add(shapeParams, 'instances', 2, 50, 1).name('Instances').onChange(updateShapes);
  gui.add(shapeParams, 'distance', 0.1, 1, 0.01).name('Distance').onChange(updateShapes);
  gui.add(shapeParams, 'cameraZoom', 2, 4, 0.01).name('Camera Zoom').onChange(updateCamera);

  gui.add(shapeParams, 'cameraAngle', ['Orbit', 'Fixed']).name('Camera').onChange(updateCamera);
  gui.add(shapeParams, 'invertColors').name('Invert Colors').onChange(updateShapes);

  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
  camera.position.set(0, 0, 50);

  renderer = new THREE.WebGLRenderer({ preserveDrawingBuffer: true, antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  document.getElementById('container').appendChild(renderer.domElement);

  // Mouse drag rotation setup
  setupDragRotation();

  updateShapes();
  updateCamera();
  animate();
}
// Mouse drag rotation for the whole path/group
// Camera update function (restored)
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
  const length = shapeParams.length || 4;
  const width = shapeParams.width || 2;
  switch (type) {
    case 'Circle':
      geometry = new THREE.CircleGeometry(0.5, 64);
      geometry.scale(length, width, 1);
      break;
    case 'Triangle':
      geometry = new THREE.CircleGeometry(0.5, 3);
      geometry.scale(length, width, 1);
      break;
    case 'Square': {
      // Custom square geometry with edge-to-edge dimensions
      const hw = width / 2;
      const hl = length / 2;
      const vertices = [
        [-hl, -hw, 0],
        [hl, -hw, 0],
        [hl, hw, 0],
        [-hl, hw, 0],
      ];
      const indices = [0, 1, 2, 0, 2, 3];
      geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices.flat(), 3));
      geometry.setIndex(indices);
      geometry.computeVertexNormals();
      break;
    }
    case 'Polygon':
      geometry = new THREE.CircleGeometry(0.5, corners);
      geometry.scale(length, width, 1);
      break;
    default:
      geometry = new THREE.CircleGeometry(0.5, 64);
      geometry.scale(length, width, 1);
  }
  geometry.computeBoundingBox();
  const center = geometry.boundingBox.getCenter(new THREE.Vector3());
  geometry.translate(-center.x, -center.y, -center.z);
  return geometry;
}

// Place shapes so they overlap along the path
function getPathPosition(pathType, i, total) {
  const spacing = shapeParams.distance;
  if (pathType === 'Line') {
    // Diagonal line
    return new THREE.Vector3(-spacing * (total - 1) / 2 + spacing * i, -spacing * (total - 1) / 2 + spacing * i, 0);
  } else if (pathType === 'Circle') {
    // Evenly distribute points around a circle, radius increased by 3x
    const angle = (i / total) * Math.PI * 2;
    const radius = 3 * spacing * total / (2 * Math.PI);
    return new THREE.Vector3(Math.cos(angle) * radius, Math.sin(angle) * radius, 0);
  }
  return new THREE.Vector3(0, 0, 0);
}

function updateShapes() {
  clearShapes();
  shapePositions = [];
  pathGroup = new THREE.Group();
  meshes = [];
  // Set background and outline color based on invertColors
  if (shapeParams.invertColors) {
    renderer.setClearColor(0xffffff, 1);
  } else {
    renderer.setClearColor(0x000000, 1);
  }
  // First, collect all positions
  for (let i = 0; i < shapeParams.instances; i++) {
    const pos = getPathPosition(shapeParams.path, i, shapeParams.instances);
    shapePositions.push(pos.clone());
  }
  // Calculate centroid
  let center = new THREE.Vector3(0, 0, 0);
  if (shapePositions.length > 0) {
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

    // Kaleidoscope logic
    if (shapeParams.kaleidoscope) {
      const segments = shapeParams.kaleidoscopeSegments;
      for (let s = 0; s < segments; s++) {
        const angle = (s / segments) * Math.PI * 2;
        const segmentGroup = new THREE.Group();
        segmentGroup.rotation.z = angle;
        for (let i = 0; i < shapeParams.instances; i++) {
          const geometry = createShapeMesh(shapeParams.type, shapeParams.corners);
          const pos = shapePositions[i].clone().sub(center);
          // Calculate tangent direction for orientation (3D)
          let tangent;
          const total = shapeParams.instances;
          if (i === 0 && total > 1) {
            const nextPos = shapePositions[i + 1].clone().sub(center);
            tangent = new THREE.Vector3().subVectors(nextPos, pos).normalize();
          } else if (i === total - 1 && total > 1) {
            const prevPos = shapePositions[i - 1].clone().sub(center);
            tangent = new THREE.Vector3().subVectors(pos, prevPos).normalize();
          } else if (total > 1) {
            const nextPos = shapePositions[i + 1].clone().sub(center);
            tangent = new THREE.Vector3().subVectors(nextPos, pos).normalize();
          } else {
            tangent = new THREE.Vector3(0, 1, 0);
          }
          const lookTarget = new THREE.Vector3().addVectors(pos, tangent);
          let outline;
          const outlineColor = shapeParams.invertColors ? 0x000000 : 0xffffff;
          if (shapeParams.fillShapes) {
            const fillColor = shapeParams.invertColors ? 0xffffff : 0x000000;
            const material = new THREE.MeshBasicMaterial({ color: fillColor, side: THREE.DoubleSide });
            const mesh = new THREE.Mesh(geometry, material);
            mesh.position.copy(pos);
            mesh.lookAt(lookTarget);
            segmentGroup.add(mesh);
            meshes.push(mesh);
          }
          let perimeterPositions = [];
          if (shapeParams.type === 'Square') {
            const hw = shapeParams.width / 2;
            const hl = shapeParams.length / 2;
            const verts = [
              [-hl, -hw, 0],
              [hl, -hw, 0],
              [hl, hw, 0],
              [-hl, hw, 0],
              [-hl, -hw, 0], // close loop
            ];
            perimeterPositions = verts.flat();
          } else if (geometry.type === 'CircleGeometry') {
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
          } else {
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
          var outlineGeom = new THREE.BufferGeometry();
          outlineGeom.setAttribute('position', new THREE.Float32BufferAttribute(perimeterPositions, 3));
          outline = new THREE.LineLoop(outlineGeom, new THREE.LineBasicMaterial({ color: outlineColor }));
          outline.position.copy(pos);
          outline.lookAt(lookTarget);
          segmentGroup.add(outline);
          outlines.push(outline);
        }
        pathGroup.add(segmentGroup);
      }
      scene.add(pathGroup);
      return;
    }
    // ...existing code for normal mode...
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
      const outlineColor = shapeParams.invertColors ? 0x000000 : 0xffffff;
      // Optionally add filled mesh
      if (shapeParams.fillShapes) {
        // Fill color matches background color
        const fillColor = shapeParams.invertColors ? 0xffffff : 0x000000;
        const material = new THREE.MeshBasicMaterial({ color: fillColor, side: THREE.DoubleSide });
        const mesh = new THREE.Mesh(geometry, material);
        mesh.position.copy(pos);
        mesh.lookAt(lookTarget);
        pathGroup.add(mesh);
        meshes.push(mesh);
      }
      // Outline creation for all shapes (including Square)
      let perimeterPositions = [];
      if (shapeParams.type === 'Square') {
        // Use square corners for outline
        const hw = shapeParams.width / 2;
        const hl = shapeParams.length / 2;
        const verts = [
          [-hl, -hw, 0],
          [hl, -hw, 0],
          [hl, hw, 0],
          [-hl, hw, 0],
          [-hl, -hw, 0], // close loop
        ];
        perimeterPositions = verts.flat();
      } else if (geometry.type === 'CircleGeometry') {
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
      } else {
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
      var outlineGeom = new THREE.BufferGeometry();
      outlineGeom.setAttribute('position', new THREE.Float32BufferAttribute(perimeterPositions, 3));
      outline = new THREE.LineLoop(outlineGeom, new THREE.LineBasicMaterial({ color: outlineColor }));
      outline.position.copy(pos);
      outline.lookAt(lookTarget);
      pathGroup.add(outline);
      outlines.push(outline);
    }
    scene.add(pathGroup);
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
  for (let mesh of meshes) {
    if (shapeParams.scaleAnim) {
      mesh.scale.setScalar(1 + 0.3 * Math.sin(Date.now() * 0.002 + mesh.position.x));
    } else {
      mesh.scale.setScalar(1);
    }
    if (shapeParams.rotateAnim) {
      mesh.rotation.z += 0.01;
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
