import * as THREE from 'three';
import { Player, Position } from '../core/types.js';
import { GameBoard, BOARD_SIZE } from '../core/board.js';

/**
 * Moteur de Rendu 3D (Three.js).
 * 
 * Responsabilités :
 * - Gérer la scène, la caméra et l'éclairage.
 * - Synchroniser l'état visuel avec l'état logique du jeu (Pattern Observer).
 * - Traduire les interactions souris (2D) en coordonnées de jeu (3D) via Raycasting.
 */
export class ThreeRenderer {
  private container: HTMLElement;
  private canvas: HTMLCanvasElement;
  private board: GameBoard;
  
  // Three.js Core
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private renderer: THREE.WebGLRenderer;
  private raycaster: THREE.Raycaster; // Pour le picking (souris -> 3D)
  private mouse: THREE.Vector2;
  
  // Cache d'objets (Object Pooling)
  // On instancie toutes les pierres au démarrage pour éviter le GC (Garbage Collection) en jeu.
  private stones: (THREE.Mesh | null)[][];
  
  // Marqueurs UI
  private ghostStone!: THREE.Mesh;       // Prévisualisation au survol
  private lastMoveMarker!: THREE.Mesh;   // Point rouge sur la dernière pierre
  private suggestionMarker!: THREE.Mesh; // Anneau vert (Conseil IA)
  
  // Matériaux PBR (Physically Based Rendering)
  private matBlack!: THREE.MeshPhysicalMaterial;
  private matWhite!: THREE.MeshPhysicalMaterial;

  // Constantes de Monde (World Units)
  private readonly BOARD_SIZE = BOARD_SIZE;
  private readonly CELL_SIZE = 2.0; 
  private readonly DROP_HEIGHT = 8.0; // Hauteur de chute pour l'animation
  private readonly GRAVITY = 0.8;
  private readonly TARGET_Y = 0.2;    // Hauteur finale sur le plateau

  constructor(containerId: string, board: GameBoard) {
    this.board = board;
    this.container = document.getElementById(containerId) as HTMLElement;
    if (!this.container) throw new Error(`Container ${containerId} not found`);

    // 1. Setup Scène
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x333333);

    // 2. Setup Caméra (Vue isométrique simulée)
    const aspect = this.container.clientWidth / this.container.clientHeight;
    this.camera = new THREE.PerspectiveCamera(45, aspect, 0.1, 1000);
    this.camera.position.set(0, 45, 35); // Angle de vue confortable
    this.camera.lookAt(0, 0, 0);

    // 3. Setup Renderer (WebGL)
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setSize(this.container.clientWidth, this.container.clientHeight);
    this.renderer.shadowMap.enabled = true; // Ombres dynamiques
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.canvas = this.renderer.domElement;
    this.container.appendChild(this.canvas);

    // 4. Éclairage Studio
    // Lumière ambiante pour déboucher les ombres
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.4);
    this.scene.add(ambientLight);

    // Key Light (Soleil) - Projette les ombres principales
    const mainLight = new THREE.DirectionalLight(0xfff4e5, 1.5);
    mainLight.position.set(15, 30, 15);
    mainLight.castShadow = true;
    mainLight.shadow.mapSize.width = 2048; // Haute résolution d'ombres
    mainLight.shadow.mapSize.height = 2048;
    mainLight.shadow.bias = -0.0001; // Évite les artefacts d'auto-ombrage (Shadow Acne)
    this.scene.add(mainLight);

    // Fill Light (Ciel) - Touche bleutée en contre-jour
    const fillLight = new THREE.DirectionalLight(0xddeeff, 0.8);
    fillLight.position.set(-15, 10, -15);
    this.scene.add(fillLight);

    // 5. Initialisation des Assets
    this.raycaster = new THREE.Raycaster();
    this.mouse = new THREE.Vector2();
    this.stones = Array(this.BOARD_SIZE).fill(null).map(() => Array(this.BOARD_SIZE).fill(null));
    
    this.initMaterials();
    this.createBoard();
    this.createStonesPool(); // Création massive des 361 pierres
    this.createMarkers();

    this.animate();
  }

  private initMaterials(): void {
    // Pierre Noire : Aspect ardoise matte
    this.matBlack = new THREE.MeshPhysicalMaterial({
        color: 0x1a1a1a,
        roughness: 0.7,
        metalness: 0.0,
        clearcoat: 0.0
    });

    // Pierre Blanche : Aspect porcelaine/coquillage brillant
    this.matWhite = new THREE.MeshPhysicalMaterial({
        color: 0xffffff,
        roughness: 0.2,
        metalness: 0.1,
        clearcoat: 1.0,
        clearcoatRoughness: 0.1
    });
  }

  /**
   * Boucle de rendu (Game Loop graphique).
   * Gère les animations (chute des pierres) et le rendu WebGL.
   */
  private animate(): void {
    requestAnimationFrame(this.animate.bind(this));

    // Animation procédurale : Chute des pierres
    for (let row = 0; row < this.BOARD_SIZE; row++) {
        for (let col = 0; col < this.BOARD_SIZE; col++) {
            const mesh = this.stones[row][col];
            if (mesh && mesh.visible) {
                // Si la pierre flotte, on applique la gravité
                if (mesh.position.y > this.TARGET_Y) {
                    mesh.position.y -= this.GRAVITY;
                    // Clamp au sol (pas de rebond complexe pour l'instant)
                    if (mesh.position.y < this.TARGET_Y) {
                        mesh.position.y = this.TARGET_Y;
                    }
                }
            }
        }
    }

    this.renderer.render(this.scene, this.camera);
  }

  private createBoard(): void {
    // Calcul de la taille physique du plateau
    const gridSize = (this.BOARD_SIZE - 1) * this.CELL_SIZE;
    const boardWidth = gridSize + (this.CELL_SIZE * 2); 

    // Le socle en bois
    const geometry = new THREE.BoxGeometry(boardWidth, 1, boardWidth);
    const material = new THREE.MeshStandardMaterial({ 
      color: 0xdcb35c,
      roughness: 0.6,
      metalness: 0.1 
    });
    const boardMesh = new THREE.Mesh(geometry, material);
    boardMesh.position.y = -0.5;
    boardMesh.receiveShadow = true;
    this.scene.add(boardMesh);

    // Le quadrillage
    const gridHelper = new THREE.GridHelper(
      gridSize, 
      this.BOARD_SIZE - 1, 
      0x000000, 
      0x000000
    );
    gridHelper.position.y = 0.01; // Z-fight fix (légèrement au-dessus du bois)
    (gridHelper.material as THREE.Material).opacity = 0.5;
    (gridHelper.material as THREE.Material).transparent = true;
    this.scene.add(gridHelper);
  }

  /**
   * Pattern Object Pooling.
   * On génère les 361 meshes possibles dès le début.
   * Pour jouer un coup, on se contente de rendre visible le mesh correspondant.
   * Gain de performance majeur (pas d'allocation mémoire dynamique).
   */
  private createStonesPool(): void {
    const geometry = new THREE.SphereGeometry(this.CELL_SIZE * 0.45, 32, 32);
    
    // Offset pour centrer la grille en (0,0,0)
    const halfSize = ((this.BOARD_SIZE - 1) * this.CELL_SIZE) / 2;

    for (let row = 0; row < this.BOARD_SIZE; row++) {
      for (let col = 0; col < this.BOARD_SIZE; col++) {
        const mesh = new THREE.Mesh(geometry, this.matBlack); // Matériau placeholder
        
        // Mapping Coordonnées Grille (Row/Col) -> Coordonnées Monde (X/Z)
        const x = (col * this.CELL_SIZE) - halfSize;
        const z = (row * this.CELL_SIZE) - halfSize;
        
        mesh.position.set(x, this.TARGET_Y, z);
        mesh.scale.y = 0.6; // Aplatissement (forme de lentille)
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        mesh.visible = false; // Caché par défaut
        
        this.scene.add(mesh);
        this.stones[row][col] = mesh;
      }
    }
  }

  private createMarkers(): void {
    // 1. Ghost Stone (Fantôme de survol)
    const geometry = new THREE.SphereGeometry(this.CELL_SIZE * 0.4, 32, 32);
    const ghostMat = new THREE.MeshBasicMaterial({ color: 0x00aaff, transparent: true, opacity: 0.5 });
    this.ghostStone = new THREE.Mesh(geometry, ghostMat);
    this.ghostStone.scale.y = 0.6;
    this.ghostStone.visible = false;
    this.scene.add(this.ghostStone);

    // 2. Last Move Marker (Point rouge)
    const markGeo = new THREE.SphereGeometry(0.2, 16, 16);
    const markMat = new THREE.MeshBasicMaterial({ color: 0xff0000 });
    this.lastMoveMarker = new THREE.Mesh(markGeo, markMat);
    this.lastMoveMarker.visible = false;
    this.scene.add(this.lastMoveMarker);

    // 3. Suggestion Marker (Anneau vert)
    const ringGeo = new THREE.RingGeometry(0.5, 0.7, 32);
    const ringMat = new THREE.MeshBasicMaterial({ color: 0x00ff89, side: THREE.DoubleSide });
    this.suggestionMarker = new THREE.Mesh(ringGeo, ringMat);
    this.suggestionMarker.rotation.x = -Math.PI / 2; // À plat
    this.suggestionMarker.visible = false;
    this.scene.add(this.suggestionMarker);
  }

  /**
   * Synchronise la vue 3D avec l'état logique du jeu.
   * Appelé à chaque fois que le contrôleur reçoit un événement 'move:made'.
   */
  draw(currentPlayer: Player, hoverPos: Position | null, lastMove: Position | null, suggestionPos: Position | null): void {
    // 1. Mise à jour des pierres (Visible/Invisible + Couleur)
    for (let row = 0; row < this.BOARD_SIZE; row++) {
      for (let col = 0; col < this.BOARD_SIZE; col++) {
        const piece = this.board.getPiece(row, col);
        const mesh = this.stones[row][col]!;
        
        if (piece === Player.NONE) {
          mesh.visible = false;
        } else {
          // Si la pierre vient d'apparaître, on déclenche l'animation de chute
          if (!mesh.visible) {
            mesh.visible = true;
            mesh.position.y = this.DROP_HEIGHT; 
          }
          // On assigne le bon matériau (Noir/Blanc)
          mesh.material = (piece === Player.BLACK) ? this.matBlack : this.matWhite;
        }
      }
    }

    // 2. Ghost Stone
    if (hoverPos) {
      this.ghostStone.visible = true;
      const target = this.stones[hoverPos.row][hoverPos.col]!;
      this.ghostStone.position.copy(target.position);
      // Le fantôme prend la couleur du joueur courant
      (this.ghostStone.material as THREE.MeshBasicMaterial).color.setHex(
        currentPlayer === Player.BLACK ? 0x000000 : 0xffffff
      );
    } else {
      this.ghostStone.visible = false;
    }

    // 3. Last Move
    if (lastMove) {
      this.lastMoveMarker.visible = true;
      const target = this.stones[lastMove.row][lastMove.col]!;
      this.lastMoveMarker.position.copy(target.position);
      this.lastMoveMarker.position.y += 0.5; // Posé sur la pierre
      
      // Contraste automatique (Point blanc sur pierre noire, etc.)
      const piece = this.board.getPiece(lastMove.row, lastMove.col);
      (this.lastMoveMarker.material as THREE.MeshBasicMaterial).color.setHex(
        piece === Player.BLACK ? 0xffffff : 0x000000
      );
    } else {
      this.lastMoveMarker.visible = false;
    }

    // 4. Suggestion
    if (suggestionPos) {
      this.suggestionMarker.visible = true;
      const target = this.stones[suggestionPos.row][suggestionPos.col]!;
      this.suggestionMarker.position.copy(target.position);
      this.suggestionMarker.position.y += 0.1;
    } else {
      this.suggestionMarker.visible = false;
    }
  }

  /**
   * Raycasting : Conversion 2D (Souris) -> 3D (Monde).
   * Projette un rayon depuis la caméra et cherche l'intersection avec un plan virtuel à Y=0.
   */
  canvasToBoard(x: number, y: number): Position | null {
    // 1. Conversion Pixels -> Normalized Device Coordinates (NDC) [-1, +1]
    const rect = this.canvas.getBoundingClientRect();
    this.mouse.x = ((x - rect.left) / rect.width) * 2 - 1;
    this.mouse.y = -((y - rect.top) / rect.height) * 2 + 1;

    // 2. Lancement du rayon
    this.raycaster.setFromCamera(this.mouse, this.camera);

    // 3. Intersection avec un plan mathématique infini (Y=0)
    // On n'intersecte pas les meshes des cases pour des raisons de performance et de précision.
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    const target = new THREE.Vector3();
    this.raycaster.ray.intersectPlane(plane, target);

  if (target) {
    // 4. Conversion Monde (X,Z) -> Grille (Row,Col)
    // Inverse de la formule utilisée dans createStonesPool
    const halfSize = ((this.BOARD_SIZE - 1) * this.CELL_SIZE) / 2;
        
    const col = Math.round((target.x + halfSize) / this.CELL_SIZE);
    const row = Math.round((target.z + halfSize) / this.CELL_SIZE);

        if (row >= 0 && row < this.BOARD_SIZE && col >= 0 && col < this.BOARD_SIZE) {
            return { row, col };
        }
    }
    
    return null;
  }

  getCanvas(): HTMLCanvasElement {
    return this.canvas;
  }

  resize(width: number, height: number): void {
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
  }

  cleanup(): void {
    this.renderer.dispose();
    this.container.removeChild(this.canvas);
  }
}