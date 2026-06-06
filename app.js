// Three.js and Scroll Handling for OMIVA Box (Single Page Viewer)

// Scene setup variables
let scene, camera, renderer, controls;
let boxGroup; // Group containing the 6 face planes
let faces = {}; // References to each of the 6 face meshes
let particles;

// UI Elements
const btnScroll = document.getElementById('btn-scroll');
const btnFree = document.getElementById('btn-free');
const btnSpinOn = document.getElementById('btn-spin-on');
const btnSpinOff = document.getElementById('btn-spin-off');
const sliderExplode = document.getElementById('explode-slider');
const valExplode = document.getElementById('explode-val');

// State variables
let isFreeMode = true;
let isSpinning = false;
let scrollProgress = 0;
let explodeDistance = 0;

// Box Dimensions (from aspect ratio analysis)
const WIDTH = 1.5;
const HEIGHT = 1.0;
const DEPTH = 0.667;

// Base positions of the 6 faces relative to the group center
const faceConfig = {
    front:  { width: WIDTH,  height: HEIGHT, pos: [0, 0, DEPTH/2],    rot: [0, 0, 0],             normal: [0, 0, 1] },
    back:   { width: WIDTH,  height: HEIGHT, pos: [0, 0, -DEPTH/2],   rot: [0, Math.PI, 0],       normal: [0, 0, -1] },
    right:  { width: DEPTH,  height: HEIGHT, pos: [WIDTH/2, 0, 0],    rot: [0, Math.PI/2, 0],     normal: [1, 0, 0] },
    left:   { width: DEPTH,  height: HEIGHT, pos: [-WIDTH/2, 0, 0],   rot: [0, -Math.PI/2, 0],    normal: [-1, 0, 0] },
    top:    { width: WIDTH,  height: DEPTH,  pos: [0, HEIGHT/2, 0],   rot: [-Math.PI/2, 0, 0],    normal: [0, 1, 0] },
    bottom: { width: WIDTH,  height: DEPTH,  pos: [0, -HEIGHT/2, 0],  rot: [Math.PI/2, 0, 0],     normal: [0, -1, 0] }
};

// Initialize Three.js Scene
function init() {
    const container = document.querySelector('.viewport-container');
    const width = container.clientWidth;
    const height = container.clientHeight;

    // 1. Scene & Camera
    scene = new THREE.Scene();

    camera = new THREE.PerspectiveCamera(40, width / height, 0.1, 100);
    camera.position.set(0, 0, 3.2);

    // 2. Renderer
    renderer = new THREE.WebGLRenderer({ canvas: document.getElementById('canvas-3d'), antialias: true, alpha: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    // 3. Orbit Controls (for free mode)
    controls = new THREE.OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.maxPolarAngle = Math.PI / 1.8;
    controls.minDistance = 1.8;
    controls.maxDistance = 5;
    controls.enabled = true; // Enabled by default

    // 4. Lights
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.75); // boosted from 0.4
    scene.add(ambientLight);

    const dirLight1 = new THREE.DirectionalLight(0xffffff, 1.2); // boosted from 0.85
    dirLight1.position.set(5, 5, 5);
    dirLight1.castShadow = true;
    scene.add(dirLight1);

    const dirLight2 = new THREE.DirectionalLight(0xffffff, 0.6); // boosted from 0.35
    dirLight2.position.set(-5, 3, -5);
    scene.add(dirLight2);

    const pointLight = new THREE.PointLight(0xff6600, 1.5, 5);
    pointLight.position.set(0, -1.2, 1);
    scene.add(pointLight);

    const spotLight = new THREE.SpotLight(0xffaa66, 1.8, 6, Math.PI / 6, 0.5, 1); // boosted from 1.5
    spotLight.position.set(2, 4, 3);
    scene.add(spotLight);

    // 5. Build the Box
    buildBox();

    // 6. Particle System
    createParticles();

    // 7. Event Listeners
    window.addEventListener('resize', onWindowResize);
    window.addEventListener('scroll', onScroll);
    setupUIControls();

    // Detect mouse drag/click to auto-switch to Free Rotate mode
    renderer.domElement.addEventListener('pointerdown', () => {
        if (!isFreeMode) {
            isFreeMode = true;
            controls.enabled = true;
            btnScroll.classList.remove('active');
            btnFree.classList.add('active');
        }
    });
    
    // Initial scroll setup
    onScroll();

    // 8. Animation Loop
    animate();
}

// Build Box out of 6 planes
function buildBox() {
    boxGroup = new THREE.Group();
    scene.add(boxGroup);

    // Texture Loader
    const textureLoader = new THREE.TextureLoader();
    
    const textures = {
        front: textureLoader.load('images/Front Panel.png'),
        back: textureLoader.load('images/Back Pnel.png'),
        right: textureLoader.load('images/Right side.png'),
        left: textureLoader.load('images/Left side .png'),
        top: textureLoader.load('images/TOP.png'),
        bottom: textureLoader.load('images/BOTTOM.png')
    };

    // Set texture wrapping and filters for high quality
    Object.values(textures).forEach(tex => {
        tex.generateMipmaps = true;
        tex.minFilter = THREE.LinearMipmapLinearFilter;
        tex.magFilter = THREE.LinearFilter;
        tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
    });

    // Create a material for each face
    const materials = {};
    Object.keys(textures).forEach(key => {
        materials[key] = new THREE.MeshStandardMaterial({
            map: textures[key],
            roughness: 0.25,
            metalness: 0.1,
            side: THREE.DoubleSide
        });
    });

    // Create planes and place them
    Object.keys(faceConfig).forEach(key => {
        const conf = faceConfig[key];
        const geometry = new THREE.PlaneGeometry(conf.width, conf.height);
        const mesh = new THREE.Mesh(geometry, materials[key]);
        
        // Position & Rotate
        mesh.position.set(conf.pos[0], conf.pos[1], conf.pos[2]);
        mesh.rotation.set(conf.rot[0], conf.rot[1], conf.rot[2]);
        mesh.castShadow = true;
        mesh.receiveShadow = true;

        boxGroup.add(mesh);
        faces[key] = mesh; // Save reference
    });
}

// Particle System (Drifting bubbles/particles)
function createParticles() {
    const particleGeo = new THREE.BufferGeometry();
    const particleCount = 200;
    const posArray = new Float32Array(particleCount * 3);

    for (let i = 0; i < particleCount * 3; i += 3) {
        posArray[i] = (Math.random() - 0.5) * 8;     // X
        posArray[i+1] = (Math.random() - 0.5) * 6;   // Y
        posArray[i+2] = (Math.random() - 0.5) * 4;   // Z
    }

    particleGeo.setAttribute('position', new THREE.BufferAttribute(posArray, 3));

    const particleMat = new THREE.PointsMaterial({
        size: 0.02,
        color: 0xff8822, // orange glow
        transparent: true,
        opacity: 0.6,
        blending: THREE.AdditiveBlending
    });

    particles = new THREE.Points(particleGeo, particleMat);
    scene.add(particles);
}

// Animate particles (bubbles rising)
function animateParticles() {
    if (!particles) return;
    const positions = particles.geometry.attributes.position.array;
    for (let i = 1; i < positions.length; i += 3) {
        positions[i] += 0.003; // rise up Y-axis
        if (positions[i] > 3) {
            positions[i] = -3; // wrap back to bottom
        }
    }
    particles.geometry.attributes.position.needsUpdate = true;
}

// Setup Event Listeners for UI Controls
function setupUIControls() {
    // Mode toggle: Scroll sync
    btnScroll.addEventListener('click', () => {
        isFreeMode = false;
        controls.enabled = false;
        btnScroll.classList.add('active');
        btnFree.classList.remove('active');
    });

    // Mode toggle: Free orbit
    btnFree.addEventListener('click', () => {
        isFreeMode = true;
        controls.enabled = true;
        btnScroll.classList.remove('active');
        btnFree.classList.add('active');
    });

    // Auto spin: On
    btnSpinOn.addEventListener('click', () => {
        isSpinning = true;
        btnSpinOn.classList.add('active');
        btnSpinOff.classList.remove('active');
    });

    // Auto spin: Off
    btnSpinOff.addEventListener('click', () => {
        isSpinning = false;
        btnSpinOn.classList.remove('active');
        btnSpinOff.classList.add('active');
    });

    // Explode slider
    sliderExplode.addEventListener('input', (e) => {
        const val = parseInt(e.target.value);
        explodeDistance = val / 100 * 0.45; // max separation 0.45 units
        valExplode.innerText = val + '%';
        updateExplode();
    });
}

// Update face positions for exploded view
function updateExplode() {
    Object.keys(faces).forEach(key => {
        const mesh = faces[key];
        const conf = faceConfig[key];
        const normal = conf.normal;

        mesh.position.set(
            conf.pos[0] + normal[0] * explodeDistance,
            conf.pos[1] + normal[1] * explodeDistance,
            conf.pos[2] + normal[2] * explodeDistance
        );
    });
}

// Handle Window Resize
function onWindowResize() {
    const container = document.querySelector('.viewport-container');
    const width = container.clientWidth;
    const height = container.clientHeight;

    camera.aspect = width / height;
    camera.updateProjectionMatrix();

    renderer.setSize(width, height);
}

// Handle Page Scroll
function onScroll() {
    const docHeight = document.documentElement.scrollHeight - window.innerHeight;
    const scrollPos = window.scrollY;
    
    // Overall scroll progress (0.0 to 1.0)
    scrollProgress = docHeight > 0 ? scrollPos / docHeight : 0;
}

// Smoothly interpolate angles (lerp)
function lerp(start, end, amt) {
    let diff = end - start;
    while (diff < -Math.PI) diff += Math.PI * 2;
    while (diff > Math.PI) diff -= Math.PI * 2;
    return start + diff * amt;
}

// Animation and Render Loop
function animate() {
    requestAnimationFrame(animate);

    // 1. Update Box Rotation and Camera Position
    if (isFreeMode) {
        controls.update();
    } else {
        // Smoothly return camera and controls target to home position
        camera.position.x = lerp(camera.position.x, 0, 0.08);
        camera.position.y = lerp(camera.position.y, 0, 0.08);
        camera.position.z = lerp(camera.position.z, 3.2, 0.08);
        controls.target.x = lerp(controls.target.x, 0, 0.08);
        controls.target.y = lerp(controls.target.y, 0, 0.08);
        controls.target.z = lerp(controls.target.z, 0, 0.08);
        controls.update();

        // If auto spinning is on, override scroll rotation
        if (isSpinning) {
            boxGroup.rotation.y += 0.008;
            boxGroup.rotation.x = Math.sin(Date.now() * 0.001) * 0.15 + 0.1;
        } else {
            // Scroll Sync Mode: Map 0.0-1.0 scroll progress to a sequence of rotations
            // We want a full 360 degree rotation around Y (0 to Math.PI * 2)
            // Plus dynamic tilting (X-axis) at the end of the scroll to show Top and Bottom
            
            const targetY = -0.3 + scrollProgress * Math.PI * 2; // offset by -0.3 for aesthetic start angle
            
            let targetX = 0.15; // default comfortable tilt showing front + top edge
            
            if (scrollProgress > 0.65 && scrollProgress <= 0.82) {
                // Tilt down to expose top face fully
                // Lerp between 0.15 and -Math.PI/2.2
                const t = (scrollProgress - 0.65) / (0.82 - 0.65);
                targetX = 0.15 + t * (-Math.PI / 2.2 - 0.15);
            } else if (scrollProgress > 0.82) {
                // Tilt up to expose bottom face fully
                // Lerp between -Math.PI/2.2 and Math.PI/2.2
                const t = (scrollProgress - 0.82) / (1.0 - 0.82);
                targetX = -Math.PI / 2.2 + t * (Math.PI / 2.2 - (-Math.PI / 2.2));
            }
            
            // Smoothly lerp towards target orientation
            boxGroup.rotation.x = lerp(boxGroup.rotation.x, targetX, 0.08);
            boxGroup.rotation.y = lerp(boxGroup.rotation.y, targetY, 0.08);
        }
    }

    // 2. Animate Particles
    animateParticles();

    // 3. Render
    renderer.render(scene, camera);
}

// Run ThreeJS App when window loads
window.addEventListener('load', () => {
    init();
});
