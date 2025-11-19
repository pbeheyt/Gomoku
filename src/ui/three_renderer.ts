import * as THREE from 'three';
import { Player, Position } from '../core/types.js';
import { GameBoard } from '../core/board.js';

export class ThreeRenderer {
  private container: HTMLElement;
  private canvas: HTMLCanvasElement;
  private board: GameBoard;
  
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private renderer: THREE.WebGLRenderer;
  private raycaster: THREE.Raycaster;
  private mouse: THREE.Vector2;
  
  private stones: (THREE.Mesh | null)[][];
  // Use definite assignment assertion (!) because these are initialized in createMarkers() called by constructor
  private ghostStone!: THREE.Mesh;
  private lastMoveMarker!: THREE.Mesh;
  private suggestionMarker!: THREE.Mesh;
  
  // PBR Materials
  private matBlack!: THREE.MeshPhysicalMaterial;
  private matWhite!: THREE.MeshPhysicalMaterial;

  private readonly BOARD_SIZE = 19;
  private readonly CELL_SIZE = 2.0; // Units in 3D space
  private readonly DROP_HEIGHT = 8.0;
  private readonly GRAVITY = 0.8;
  private readonly TARGET_Y = 0.2;

  constructor(containerId: string, board: GameBoard) {
    this.board = board;
    this.container = document.getElementById(containerId) as HTMLElement;
    if (!this.container) throw new Error(`Container ${containerId} not found`);

    // 1. Setup Scene
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x333333);

    // 2. Setup Camera
    const aspect = this.container.clientWidth / this.container.clientHeight;
    this.camera = new THREE.PerspectiveCamera(45, aspect, 0.1, 1000);
    // Position camera for a nice angled view
    this.camera.position.set(0, 45, 35);
    this.camera.lookAt(0, 0, 0);

    // 3. Setup Renderer
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setSize(this.container.clientWidth, this.container.clientHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.canvas = this.renderer.domElement;
    this.container.appendChild(this.canvas);

    // 4. Setup Studio Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.4);
    this.scene.add(ambientLight);

    // Main Light (Warm / Sun)
    const mainLight = new THREE.DirectionalLight(0xfff4e5, 1.5);
    mainLight.position.set(15, 30, 15);
    mainLight.castShadow = true;
    mainLight.shadow.mapSize.width = 2048;
    mainLight.shadow.mapSize.height = 2048;
    mainLight.shadow.bias = -0.0001;
    this.scene.add(mainLight);

    // Fill Light (Cool / Sky) - Softens shadows
    const fillLight = new THREE.DirectionalLight(0xddeeff, 0.8);
    fillLight.position.set(-15, 10, -15);
    this.scene.add(fillLight);

    // 5. Initialize Objects
    this.raycaster = new THREE.Raycaster();
    this.mouse = new THREE.Vector2();
    this.stones = Array(this.BOARD_SIZE).fill(null).map(() => Array(this.BOARD_SIZE).fill(null));
    
    this.initMaterials();
    this.createBoard();
    this.createStonesPool();
    this.createMarkers();

    // Start Animation Loop
    this.animate();
  }

  private initMaterials(): void {
    // Black Stone: Matte Slate look
    this.matBlack = new THREE.MeshPhysicalMaterial({
        color: 0x1a1a1a,
        roughness: 0.7,
        metalness: 0.0,
        clearcoat: 0.0
    });

    // White Stone: Glossy Porcelain/Shell look
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

    // Animation Logic: Drop Stones
    let needsRender = true; // Optimize if needed, but for now render always for smooth orbit/hover

    for (let row = 0; row < this.BOARD_SIZE; row++) {
        for (let col = 0; col < this.BOARD_SIZE; col++) {
            const mesh = this.stones[row][col];
            if (mesh && mesh.visible) {
                // If stone is above board, make it fall
                if (mesh.position.y > this.TARGET_Y) {
                    mesh.position.y -= this.GRAVITY;
                    // Bounce or clamp? Just clamp for "heavy" feel
                    if (mesh.position.y < this.TARGET_Y) {
                        mesh.position.y = this.TARGET_Y;
                        // TODO: Add "Clack" sound here
                    }
                }
            }
        }
    }

    this.renderer.render(this.scene, this.camera);
  }

  private createBoard(): void {
    // Gomoku Logic: 19 lines means 18 squares.
    // Grid Size = (19-1) * CELL_SIZE
    const gridSize = (this.BOARD_SIZE - 1) * this.CELL_SIZE;
    
    // Board mesh needs to be slightly larger than the grid (margin)
    const boardWidth = gridSize + (this.CELL_SIZE * 2); 

    const geometry = new THREE.BoxGeometry(boardWidth, 1, boardWidth);
    const material = new THREE.MeshStandardMaterial({ 
      color: 0xdcb35c,
      roughness: 0.6,
      metalness: 0.1 
    });
    const boardMesh = new THREE.Mesh(geometry, material);
    boardMesh.position.y = -0.5; // Top surface at y=0
    boardMesh.receiveShadow = true;
    this.scene.add(boardMesh);

    // Grid Lines
    // Grid Lines
    // Divisions = BOARD_SIZE - 1 (18 squares = 19 lines)
    const gridHelper = new THREE.GridHelper(
      gridSize, 
      this.BOARD_SIZE - 1, 
      0x000000, 
      0x000000
    );
    gridHelper.position.y = 0.01; // Slightly above board
    (gridHelper.material as THREE.Material).opacity = 0.5;
    (gridHelper.material as THREE.Material).transparent = true;
    this.scene.add(gridHelper);
  }

  private createStonesPool(): void {
    const geometry = new THREE.SphereGeometry(this.CELL_SIZE * 0.45, 32, 32);
    
    const halfSize = ((this.BOARD_SIZE - 1) * this.CELL_SIZE) / 2;

    for (let row = 0; row < this.BOARD_SIZE; row++) {
      for (let col = 0; col < this.BOARD_SIZE; col++) {
        const mesh = new THREE.Mesh(geometry, this.matBlack); // Default mat
        
        // Position: Map row/col to 3D coordinates
        // 3D X = Column, 3D Z = Row
  const x = (col * this.CELL_SIZE) - halfSize;
  const z = (row * this.CELL_SIZE) - halfSize;
        
        mesh.position.set(x, this.TARGET_Y, z);
        mesh.scale.y = 0.6;
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        mesh.visible = false;
        
        this.scene.add(mesh);
        this.stones[row][col] = mesh;
      }
    }
  }

  private createMarkers(): void {
    // Ghost Stone (Hover)
    const geometry = new THREE.SphereGeometry(this.CELL_SIZE * 0.4, 32, 32);
    const ghostMat = new THREE.MeshBasicMaterial({ color: 0x00aaff, transparent: true, opacity: 0.5 });
    this.ghostStone = new THREE.Mesh(geometry, ghostMat);
    this.ghostStone.scale.y = 0.6;
    this.ghostStone.visible = false;
    this.scene.add(this.ghostStone);

    // Last Move Marker (Red dot on top)
    const markGeo = new THREE.SphereGeometry(0.2, 16, 16);
    const markMat = new THREE.MeshBasicMaterial({ color: 0xff0000 });
    this.lastMoveMarker = new THREE.Mesh(markGeo, markMat);
    this.lastMoveMarker.visible = false;
    this.scene.add(this.lastMoveMarker);

    // Suggestion Marker (Green ring)
    const ringGeo = new THREE.RingGeometry(0.5, 0.7, 32);
    const ringMat = new THREE.MeshBasicMaterial({ color: 0x00ff89, side: THREE.DoubleSide });
    this.suggestionMarker = new THREE.Mesh(ringGeo, ringMat);
    this.suggestionMarker.rotation.x = -Math.PI / 2;
    this.suggestionMarker.visible = false;
    this.scene.add(this.suggestionMarker);
  }

  draw(currentPlayer: Player, hoverPos: Position | null, lastMove: Position | null, suggestionPos: Position | null): void {
    // 1. Update Stones
    for (let row = 0; row < this.BOARD_SIZE; row++) {
      for (let col = 0; col < this.BOARD_SIZE; col++) {
        const piece = this.board.getPiece(row, col);
        const mesh = this.stones[row][col]!;
        
        if (piece === Player.NONE) {
          mesh.visible = false;
        } else {
          // If stone was not visible before, trigger drop animation
          if (!mesh.visible) {
            mesh.visible = true;
            mesh.position.y = this.DROP_HEIGHT; // Start falling
          }
          // Set correct material
          mesh.material = (piece === Player.BLACK) ? this.matBlack : this.matWhite;
        }
      }
    }

    // 2. Update Ghost Stone
    if (hoverPos) {
      this.ghostStone.visible = true;
      const target = this.stones[hoverPos.row][hoverPos.col]!;
      this.ghostStone.position.copy(target.position);
      // Ghost color based on player?
      (this.ghostStone.material as THREE.MeshBasicMaterial).color.setHex(
        currentPlayer === Player.BLACK ? 0x000000 : 0xffffff
      );
      (this.ghostStone.material as THREE.MeshBasicMaterial).opacity = 0.5;
    } else {
      this.ghostStone.visible = false;
    }

    // 3. Update Last Move Marker
    if (lastMove) {
      this.lastMoveMarker.visible = true;
      const target = this.stones[lastMove.row][lastMove.col]!;
      this.lastMoveMarker.position.copy(target.position);
      this.lastMoveMarker.position.y += 0.5; // Sit on top
      // Contrast color
      const piece = this.board.getPiece(lastMove.row, lastMove.col);
      (this.lastMoveMarker.material as THREE.MeshBasicMaterial).color.setHex(
        piece === Player.BLACK ? 0xffffff : 0x000000 // White dot on black stone, Black on white
      );
    } else {
      this.lastMoveMarker.visible = false;
    }

    // 4. Update Suggestion
    if (suggestionPos) {
      this.suggestionMarker.visible = true;
      const target = this.stones[suggestionPos.row][suggestionPos.col]!;
      this.suggestionMarker.position.copy(target.position);
      this.suggestionMarker.position.y += 0.1;
    } else {
      this.suggestionMarker.visible = false;
    }

    // Render is handled by animate loop
  }

  canvasToBoard(x: number, y: number): Position | null {
    // Convert mouse to Normalized Device Coordinates (-1 to +1)
    const rect = this.canvas.getBoundingClientRect();
    this.mouse.x = ((x - rect.left) / rect.width) * 2 - 1;
    this.mouse.y = -((y - rect.top) / rect.height) * 2 + 1;

    this.raycaster.setFromCamera(this.mouse, this.camera);

    // Intersect with a virtual plane at y=0 (the board surface)
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    const target = new THREE.Vector3();
    this.raycaster.ray.intersectPlane(plane, target);

  if (target) {
    // Convert 3D world coords back to Row/Col
    // Formula: coord = (index * CELL_SIZE) - halfSize
    // Reverse: index = (coord + halfSize) / CELL_SIZE
        
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
    // No need to force render, animation loop handles it
  }

  cleanup(): void {
    // Dispose Three.js resources
    this.renderer.dispose();
    this.container.removeChild(this.canvas);
    // Optional: Dispose geometries/materials to prevent leaks
  }
}