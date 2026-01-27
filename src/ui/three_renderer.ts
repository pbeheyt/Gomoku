import * as THREE from 'three';
import { Player, Position, DebugMove } from '../core/types.js';
import { GameBoard, BOARD_SIZE } from '../core/board.js';

export class ThreeRenderer {
  private container: HTMLElement;
  private canvas: HTMLCanvasElement;
  private board: GameBoard;
  
  // Three.js Core
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private renderer: THREE.WebGLRenderer;
  private raycaster: THREE.Raycaster;
  private mouse: THREE.Vector2;
  
  // Cache d'objets
  private stones: (THREE.Mesh | null)[][];
  
  // Marqueurs UI
  private ghostStone!: THREE.Mesh;
  private lastMoveMarker!: THREE.Mesh;
  private suggestionMarker!: THREE.Mesh;
  private winningLine: THREE.Mesh | null = null;
  
  private debugPlanes: THREE.Mesh[] = [];
  private debugGroup: THREE.Group;

  // Matériaux
  private matBlack!: THREE.MeshPhysicalMaterial;
  private matWhite!: THREE.MeshPhysicalMaterial;

  // Constantes
  private readonly BOARD_SIZE = BOARD_SIZE;
  private readonly CELL_SIZE = 2.0; 
  private readonly DROP_HEIGHT = 8.0;
  private readonly GRAVITY = 0.8;
  private readonly TARGET_Y = 0.2;

  constructor(containerId: string, board: GameBoard) {
    this.board = board;
    this.container = document.getElementById(containerId) as HTMLElement;
    if (!this.container) throw new Error(`Container ${containerId} not found`);

    // 1. Setup Scène
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x333333);

    // 2. Setup Caméra
    const aspect = this.container.clientWidth / this.container.clientHeight;
    this.camera = new THREE.PerspectiveCamera(45, aspect, 0.1, 1000);
    this.camera.position.set(0, 45, 35);
    this.camera.lookAt(0, 0, 0);

    // 3. Setup Renderer
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setSize(this.container.clientWidth, this.container.clientHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.canvas = this.renderer.domElement;
    this.container.appendChild(this.canvas);

    // 4. Éclairage
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.4);
    this.scene.add(ambientLight);

    // Key Light (Soleil)
    const mainLight = new THREE.DirectionalLight(0xfff4e5, 1.5);
    mainLight.position.set(15, 30, 15);
    mainLight.castShadow = true;
    mainLight.shadow.mapSize.width = 2048;
    mainLight.shadow.mapSize.height = 2048;
    mainLight.shadow.bias = -0.0001;
    this.scene.add(mainLight);

    // Fill Light (Ciel)
    const fillLight = new THREE.DirectionalLight(0xddeeff, 0.8);
    fillLight.position.set(-15, 10, -15);
    this.scene.add(fillLight);

    // 5. Initialisation Assets
    this.raycaster = new THREE.Raycaster();
    this.mouse = new THREE.Vector2();
    this.stones = Array(this.BOARD_SIZE).fill(null).map(() => Array(this.BOARD_SIZE).fill(null));
    
    this.debugGroup = new THREE.Group();
    this.scene.add(this.debugGroup);

    this.initMaterials();
    this.createBoard();
    this.createStonesPool();
    this.createMarkers();

    this.animate();
  }

  private initMaterials(): void {
    this.matBlack = new THREE.MeshPhysicalMaterial({
        color: 0x1a1a1a,
        roughness: 0.7,
        metalness: 0.0,
        clearcoat: 0.0
    });

    this.matWhite = new THREE.MeshPhysicalMaterial({
        color: 0xffffff,
        roughness: 0.2,
        metalness: 0.1,
        clearcoat: 1.0,
        clearcoatRoughness: 0.1
    });
  }

  private animate(): void {
    requestAnimationFrame(this.animate.bind(this));

    // Animation chute des pierres
    for (let row = 0; row < this.BOARD_SIZE; row++) {
        for (let col = 0; col < this.BOARD_SIZE; col++) {
            const mesh = this.stones[row][col];
            if (mesh && mesh.visible) {
                // Si la pierre flotte, on applique la gravité
                if (mesh.position.y > this.TARGET_Y) {
                    mesh.position.y -= this.GRAVITY;
                    if (mesh.position.y < this.TARGET_Y) {
                        mesh.position.y = this.TARGET_Y;
                    }
                }
            }
        }
    }

    // Animation extension du Laser de Victoire
    if (this.winningLine && this.winningLine.scale.y < 1) {
        this.winningLine.scale.y += 0.04;
        if (this.winningLine.scale.y > 1) this.winningLine.scale.y = 1;
    }

    this.renderer.render(this.scene, this.camera);
  }

  private createBoard(): void {
    // Calcul taille physique du plateau
    const gridSize = (this.BOARD_SIZE - 1) * this.CELL_SIZE;
    const boardWidth = gridSize + (this.CELL_SIZE * 2); 

    // Socle en bois
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

    // Quadrillage
    const gridHelper = new THREE.GridHelper(
      gridSize, 
      this.BOARD_SIZE - 1, 
      0x000000, 
      0x000000
    );
    gridHelper.position.y = 0.01; // Légèrement au-dessus du bois
    (gridHelper.material as THREE.Material).opacity = 0.5;
    (gridHelper.material as THREE.Material).transparent = true;
    this.scene.add(gridHelper);
  }

  private createStonesPool(): void {
    const geometry = new THREE.SphereGeometry(this.CELL_SIZE * 0.45, 32, 32);
    
    // Offset pour centrer la grille en (0,0,0)
    const halfSize = ((this.BOARD_SIZE - 1) * this.CELL_SIZE) / 2;

    for (let row = 0; row < this.BOARD_SIZE; row++) {
      for (let col = 0; col < this.BOARD_SIZE; col++) {
        const mesh = new THREE.Mesh(geometry, this.matBlack);
        
        // Mapping Coordonnées Grille (Row/Col) -> Coordonnées Monde (X/Z)
        const x = (col * this.CELL_SIZE) - halfSize;
        const z = (row * this.CELL_SIZE) - halfSize;
        
        mesh.position.set(x, this.TARGET_Y, z);
        mesh.scale.y = 0.6;
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        mesh.visible = false; // Caché par défaut
        
        this.scene.add(mesh);
        this.stones[row][col] = mesh;
      }
    }
  }

  private createMarkers(): void {
    // 1. Ghost Stone
    const geometry = new THREE.SphereGeometry(this.CELL_SIZE * 0.4, 32, 32);
    const ghostMat = new THREE.MeshBasicMaterial({ color: 0x00aaff, transparent: true, opacity: 0.5 });
    this.ghostStone = new THREE.Mesh(geometry, ghostMat);
    this.ghostStone.scale.y = 0.6;
    this.ghostStone.visible = false;
    this.scene.add(this.ghostStone);

    // 2. Last Move Marker
    const markGeo = new THREE.SphereGeometry(0.2, 16, 16);
    const markMat = new THREE.MeshBasicMaterial({ color: 0xff0000 });
    this.lastMoveMarker = new THREE.Mesh(markGeo, markMat);
    this.lastMoveMarker.visible = false;
    this.scene.add(this.lastMoveMarker);

    // 3. Suggestion Marker
    const ringGeo = new THREE.RingGeometry(0.5, 0.7, 32);
    const ringMat = new THREE.MeshBasicMaterial({ color: 0x00ff89, side: THREE.DoubleSide });
    this.suggestionMarker = new THREE.Mesh(ringGeo, ringMat);
    this.suggestionMarker.rotation.x = -Math.PI / 2; // À plat
    this.suggestionMarker.visible = false;
    this.scene.add(this.suggestionMarker);
  }

  draw(currentPlayer: Player, hoverPos: Position | null, lastMove: Position | null, suggestionPos: Position | null): void {
    // 1. Mise à jour des pierres
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
          mesh.material = (piece === Player.BLACK) ? this.matBlack : this.matWhite;
        }
      }
    }

    // 2. Ghost Stone
    if (hoverPos) {
      this.ghostStone.visible = true;
      const target = this.stones[hoverPos.row][hoverPos.col]!;
      this.ghostStone.position.copy(target.position);
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
      
      // Contraste
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

  drawWinningLine(start: Position, end: Position, player: Player): void {
    if (this.winningLine) {
        this.scene.remove(this.winningLine);
        this.winningLine = null;
    }

    // 1. Calcul des coordonnées Monde
    const halfSize = ((this.BOARD_SIZE - 1) * this.CELL_SIZE) / 2;
    const startX = (start.col * this.CELL_SIZE) - halfSize;
    const startZ = (start.row * this.CELL_SIZE) - halfSize;
    const endX = (end.col * this.CELL_SIZE) - halfSize;
    const endZ = (end.row * this.CELL_SIZE) - halfSize;

    const p1 = new THREE.Vector3(startX, this.TARGET_Y + 0.5, startZ);
    const p2 = new THREE.Vector3(endX, this.TARGET_Y + 0.5, endZ);

    // 2. Création de la géométrie
    const distance = p1.distanceTo(p2);
    const geometry = new THREE.CylinderGeometry(0.2, 0.2, distance, 8);
    
    const material = new THREE.MeshStandardMaterial({ 
        color: 0x00ff89,
        emissive: 0x00ff89,
        emissiveIntensity: 0.8,
        roughness: 0.2
    });

    this.winningLine = new THREE.Mesh(geometry, material);
    
    // 3. Orientation et Positionnement
    const center = p1.clone().add(p2).multiplyScalar(0.5);
    this.winningLine.position.copy(center);
    this.winningLine.lookAt(p2);
    this.winningLine.rotateX(Math.PI / 2);
    
    // Taille nulle puis on l'étendre progressivement
    this.winningLine.scale.y = 0;

    this.scene.add(this.winningLine);
  }

  clearWinningLine(): void {
    if (this.winningLine) {
        this.scene.remove(this.winningLine);
        this.winningLine = null;
    }
  }

  drawHeatmap(moves: DebugMove[]): void {
    this.clearHeatmap();

    const geometry = new THREE.PlaneGeometry(this.CELL_SIZE, this.CELL_SIZE);
    geometry.rotateX(-Math.PI / 2);

    // min/max scores (Minimax)
    let minScore = Infinity;
    let maxScore = -Infinity;
    moves.forEach(m => {
        if (m.type === 1) {
            if (m.score < minScore) minScore = m.score;
            if (m.score > maxScore) maxScore = m.score;
        }
    });

    moves.forEach(move => {
        let color = 0xffd700; // Jaune (Candidat)
        let opacity = 0.3;

        // Type 2 : One Shot -> Violet
        if (move.type === 2) {
            color = 0x9d00ff;
            opacity = 0.8;
        }
        // Type 1 : Minimax -> Rouge
        else if (move.type === 1) {
            color = 0xff0000;
            
            // Gradient d'opacité basé sur le score
            if (maxScore > minScore) {
                const normalized = (move.score - minScore) / (maxScore - minScore);
                opacity = 0.4 + (normalized * 0.5);
            } else {
                opacity = 0.8;
            }
        }

        const material = new THREE.MeshBasicMaterial({
            color: color,
            transparent: true,
            opacity: opacity,
            side: THREE.DoubleSide,
        });

        const mesh = new THREE.Mesh(geometry, material);
        
        // Positionnement
        const halfSize = ((this.BOARD_SIZE - 1) * this.CELL_SIZE) / 2;
        const x = (move.col * this.CELL_SIZE) - halfSize;
        const z = (move.row * this.CELL_SIZE) - halfSize;
        
        mesh.position.set(x, 0.005, z); 
        mesh.scale.setScalar(1.0);

        this.debugGroup.add(mesh);
        this.debugPlanes.push(mesh);
    });
  }

  clearHeatmap(): void {
    this.debugPlanes.forEach(mesh => {
        if (mesh.geometry) mesh.geometry.dispose();
        if (Array.isArray(mesh.material)) {
            mesh.material.forEach(m => m.dispose());
        } else {
            mesh.material.dispose();
        }
        this.debugGroup.remove(mesh);
    });
    this.debugPlanes = [];
  }

  canvasToBoard(x: number, y: number): Position | null {
    // 1. Conversion Pixels -> [-1, +1]
    const rect = this.canvas.getBoundingClientRect();
    this.mouse.x = ((x - rect.left) / rect.width) * 2 - 1;
    this.mouse.y = -((y - rect.top) / rect.height) * 2 + 1;

    // 2. Lancement du rayon
    this.raycaster.setFromCamera(this.mouse, this.camera);

    // 3. Intersection avec un plan mathématique infini (Y=0)
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