import * as THREE from 'three';
import * as CANNON from 'cannon-es';

// ==========================================
// 1. SETUP GRAFICO (Three.js)
// ==========================================
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 100);
camera.position.set(0, 5, 10);
camera.lookAt(0, 0, 0);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

// Aggiungiamo luce per vedere il 3D
const ambientLight = new THREE.AmbientLight(0x404040); // Luce base
const directionalLight = new THREE.DirectionalLight(0xffffff, 1);
directionalLight.position.set(5, 10, 5);
scene.add(ambientLight, directionalLight);

// ==========================================
// 2. SETUP FISICO (Cannon-es)
// ==========================================
const world = new CANNON.World({
    gravity: new CANNON.Vec3(0, -9.82, 0), // Gravità terrestre verso il basso (asse Y)
});

// Aggiungiamo un materiale per far rimbalzare le cose
const defaultMaterial = new CANNON.Material('default');
const defaultContactMaterial = new CANNON.ContactMaterial(
    defaultMaterial, defaultMaterial, {
        friction: 0.1,
        restitution: 0.7, // 0 = nessun rimbalzo, 1 = rimbalzo perfetto
    }
);
world.addContactMaterial(defaultContactMaterial);

// ==========================================
// 3. CREIAMO GLI OGGETTI (Sfera e Pavimento)
// ==========================================

// --- PAVIMENTO ---
// Grafica
const floorMesh = new THREE.Mesh(
    new THREE.PlaneGeometry(20, 20),
    new THREE.MeshStandardMaterial({ color: 0x555555 })
);
floorMesh.rotation.x = -Math.PI / 2; // Sdraiato in orizzontale
scene.add(floorMesh);

// Fisica
const floorBody = new CANNON.Body({
    type: CANNON.Body.STATIC, // Il pavimento non cade
    shape: new CANNON.Plane(),
    material: defaultMaterial
});
floorBody.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
world.addBody(floorBody);

// --- LA PALLINA ---
const radius = 1;

// Grafica
const ballMesh = new THREE.Mesh(
    new THREE.SphereGeometry(radius, 32, 32),
    new THREE.MeshStandardMaterial({ color: 0xff0000 }) // Pallina rossa
);
scene.add(ballMesh);

// Fisica
const ballBody = new CANNON.Body({
    mass: 1, // Ha un peso, quindi subirà la gravità
    shape: new CANNON.Sphere(radius),
    position: new CANNON.Vec3(0, 8, 0), // Parte da 8 metri di altezza
    material: defaultMaterial
});
world.addBody(ballBody);

// ==========================================
// 4. LOOP DI GIOCO (Il "Sync")
// ==========================================
const timeStep = 1 / 60; // 60 frame al secondo

function animate() {
    requestAnimationFrame(animate);

    // Fai avanzare la fisica nel tempo
    world.step(timeStep);

    // TRUCCO MAGICO: Copia la posizione fisica su quella grafica
    ballMesh.position.copy(ballBody.position);
    ballMesh.quaternion.copy(ballBody.quaternion);

    // Renderizza la scena
    renderer.render(scene, camera);
}

animate();