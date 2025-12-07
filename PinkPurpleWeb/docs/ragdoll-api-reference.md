# API Reference - Ragdoll System Implementation Guide

## Pour l'IA Spécialisée

Ce document contient les interfaces, signatures et contraintes techniques pour implémenter le système ragdoll.

---

## Technologies

- **Serveur**: Node.js, JavaScript ES6+
- **Client**: JavaScript ES6+, Canvas 2D API
- **Protocole**: Binaire (Buffer/Uint8Array)
- **Existant**: Socket.IO pour communication temps réel

---

## Interfaces Serveur (Node.js)

### RagdollPhysicsService.js

```javascript
/**
 * Service principal de physique ragdoll
 * Doit être autonome et ne pas dépendre des autres modules de jeu
 */
class RagdollPhysicsService {
    constructor(config: {
        gravity: number,      // Ex: 8
        timeStep: number      // Ex: 1/60 = 0.0166...
    })
    
    createRagdoll(
        playerId: string,
        x: number,
        y: number,
        facingRight: boolean
    ): RagdollBody
    
    update(deltaTime: number): void
    
    applyImpact(
        playerId: string,
        angle: number,        // Radians
        force: number,        // 0-100+
        contactPoint: {x: number, y: number}
    ): void
    
    setRagdollEnabled(playerId: string, enabled: boolean): void
    
    serializeRagdoll(playerId: string): Buffer
    
    destroyRagdoll(playerId: string): void
}
```

### RagdollBody.js

```javascript
/**
 * Corps ragdoll complet d'un joueur
 * Gère tous les membres et articulations
 */
class RagdollBody {
    constructor(id: string, x: number, y: number)
    
    // Propriétés publiques
    id: string
    state: 'normal' | 'stunned' | 'ragdoll'
    limbs: {
        torso: Limb,
        head: Limb,
        upperArmLeft: Limb,
        lowerArmLeft: Limb,
        upperArmRight: Limb,
        lowerArmRight: Limb,
        upperLegLeft: Limb,
        lowerLegLeft: Limb,
        upperLegRight: Limb,
        lowerLegRight: Limb
    }
    joints: Array<Joint>
    
    // Méthodes
    update(deltaTime: number, obstacles: Array<{x, y, w, h}>): void
    
    applyImpulseToLimb(limbName: string, vx: number, vy: number): void
    
    enableRagdoll(): void
    
    disableRagdoll(recoveryDuration: number): void
    
    getCenterOfMass(): {x: number, y: number}
    
    isGrounded(): boolean
    
    serialize(): Buffer
}
```

### Limb.js

```javascript
/**
 * Membre individuel (segment de corps)
 * Simule physique 2D basique avec rotation
 */
class Limb {
    constructor(
        name: string,
        length: number,       // Pixels
        mass: number,         // Unités arbitraires
        x: number,
        y: number,
        angle: number         // Radians
    )
    
    // Propriétés publiques
    name: string
    length: number
    mass: number
    x: number              // Centre du membre
    y: number
    angle: number
    vx: number             // Vélocité linéaire
    vy: number
    angularVelocity: number
    
    // Méthodes
    getEndPoints(): {
        start: {x: number, y: number},
        end: {x: number, y: number}
    }
    
    applyForce(fx: number, fy: number, point: {x, y}): void
    
    update(deltaTime: number): void
    
    checkCollision(obstacle: {x, y, w, h}): boolean
}
```

### Joint.js

```javascript
/**
 * Articulation contrainte entre deux membres
 * Utilise Position Based Dynamics ou équivalent
 */
class Joint {
    constructor(
        limbA: Limb,
        limbB: Limb,
        config: {
            minAngle: number,      // Radians
            maxAngle: number,
            stiffness: number,     // 0-1
            damping: number        // 0-1
        }
    )
    
    // Propriétés publiques
    limbA: Limb
    limbB: Limb
    anchor: {x: number, y: number}
    currentAngle: number
    
    // Méthodes
    solve(): void  // Résout les contraintes, modifie membres directement
    
    applySpringForce(targetAngle: number, strength: number): void
}
```

### PhysicsConstraints.js (Helper)

```javascript
/**
 * Fonctions utilitaires pour contraintes physiques
 */
export function clampAngle(angle: number, min: number, max: number): number
export function normalizeAngle(angle: number): number  // [-PI, PI]
export function applyDamping(velocity: number, damping: number): number
export function checkLineVsRect(
    start: {x, y},
    end: {x, y},
    rect: {x, y, w, h}
): boolean
```

---

## Interfaces Client (JavaScript)

### RagdollAnimationService.js

```javascript
/**
 * Service d'animation côté client
 * Désérialise états serveur et interpole
 */
class RagdollAnimationService {
    constructor(network: NetworkManager)
    
    registerRagdoll(playerId: string, initialState: Object): void
    
    updateRagdollState(playerId: string, serializedState: Buffer): void
    
    interpolate(playerId: string, alpha: number): void  // alpha: 0-1
    
    playAnimation(
        playerId: string,
        animationType: 'impact' | 'fall' | 'recovery',
        params: Object
    ): void
    
    getRagdollState(playerId: string): Object  // État interpolé actuel
    
    unregisterRagdoll(playerId: string): void
}
```

### ProceduralAnimator.js

```javascript
/**
 * Générateur d'animations procédurales
 * Pure functions, pas d'état interne
 */
class ProceduralAnimator {
    animateImpact(
        ragdollState: Object,
        impact: {angle: number, force: number, contactPoint: {x, y}}
    ): Object  // Retourne état modifié
    
    animateFall(
        ragdollState: Object,
        progress: number  // 0-1
    ): Object
    
    animateRecovery(
        ragdollState: Object,
        progress: number
    ): Object
    
    animateBatSwing(
        ragdollState: Object,
        swingPhase: number,  // 0-1
        facing: 1 | -1
    ): Object
}
```

### IKSolver.js

```javascript
/**
 * Résolution Inverse Kinematics 2D
 * Algorithme: FABRIK ou CCD recommandé
 */
class IKSolver {
    solveTwoJoint(
        shoulder: {x: number, y: number},
        target: {x: number, y: number},
        upperLength: number,
        lowerLength: number
    ): {
        elbowAngle: number,
        shoulderAngle: number
    }
    
    solveFullBody(
        targetPose: Object,      // Positions cibles des extrémités
        currentState: Object
    ): Object  // Angles calculés pour tous les membres
}
```

### RagdollRenderer.js

```javascript
/**
 * Rendu Canvas 2D du ragdoll
 * Style: Neon, cohérent avec le jeu actuel
 */
class RagdollRenderer {
    constructor(ctx: CanvasRenderingContext2D)
    
    drawRagdoll(
        ragdollState: Object,
        playerId: string,
        style: {
            color: string,         // Ex: '#9393D6'
            glowColor: string,
            lineWidth: number
        }
    ): void
    
    drawLimb(
        limb: {x, y, angle, length},
        style: Object
    ): void
    
    drawJoint(joint: {x, y}, style: Object): void
    
    applyVisualEffects(
        ragdollState: Object,
        previousState: Object
    ): void  // Motion blur, trails, etc.
}
```

### SpringPhysics.js (Helper)

```javascript
/**
 * Physique de ressort pour smooth interpolation
 */
export class Spring {
    constructor(stiffness: number, damping: number)
    
    update(
        current: number,
        target: number,
        velocity: number,
        deltaTime: number
    ): {
        position: number,
        velocity: number
    }
}
```

---

## Format Binaire (Protocole)

### État Complet Ragdoll
```
Offset | Size | Type    | Description
-------|------|---------|------------------
0      | 1    | Uint8   | Flags (ragdoll enabled, grounded, etc.)
1      | 2    | Int16LE | Center of mass X * 10
3      | 2    | Int16LE | Center of mass Y * 10
5      | 1    | Uint8   | Limb count (10)
6      | 30   | -       | Limbs (3 bytes each):
       |      |         |   - Angle * 1000 (Int16LE, 2 bytes)
       |      |         |   - Flags (Uint8, 1 byte)
```
**Total: 36 bytes**

### Désérialisation Client
```javascript
function deserializeRagdoll(buffer) {
    const data = new Uint8Array(buffer);
    const flags = data[0];
    const centerX = ((data[2] << 8) | data[1]) / 10;
    const centerY = ((data[4] << 8) | data[3]) / 10;
    const limbCount = data[5];
    
    const limbs = [];
    for (let i = 0; i < limbCount; i++) {
        const offset = 6 + i * 3;
        const angle = ((data[offset+1] << 8) | data[offset]) / 1000;
        const limbFlags = data[offset+2];
        limbs.push({angle, flags: limbFlags});
    }
    
    return {flags, centerX, centerY, limbs};
}
```

---

## Contraintes & Exigences

### Performance
- Physique serveur: **< 2ms par ragdoll** (60 FPS target)
- Rendu client: **< 1ms par ragdoll** (incluant interpolation)
- Mémoire: **< 5KB par ragdoll** (état complet)

### Stabilité
- **Pas d'explosions physiques** (membres ne doivent pas s'éloigner infiniment)
- **Convergence garantie** des contraintes (max 10 itérations)
- **Gestion des edge cases**: coincé dans mur, vitesse trop élevée, etc.

### Réalisme
- **Contraintes anatomiques respectées** (pas de poses impossibles)
- **Transitions smooth** entre ragdoll et contrôle normal
- **Réaction cohérente** aux impacts (direction, force)

### Intégration
- **Pas de modification** du code existant sauf points d'intégration définis
- **Service autonome** (peut fonctionner indépendamment)
- **Tests unitaires** pour chaque classe

---

## Paramètres Physiques Recommandés

```javascript
const RECOMMENDED_CONFIG = {
    // Longueurs (pixels, pour 1080p)
    HEAD_RADIUS: 12,
    TORSO_LENGTH: 40,
    UPPER_ARM_LENGTH: 25,
    LOWER_ARM_LENGTH: 20,
    UPPER_LEG_LENGTH: 30,
    LOWER_LEG_LENGTH: 25,
    
    // Masses (relatives)
    HEAD_MASS: 3,
    TORSO_MASS: 10,
    ARM_MASS: 2,
    LEG_MASS: 3,
    
    // Limites angulaires (radians)
    JOINTS: {
        elbow: {min: -0.1 * Math.PI, max: 0.7 * Math.PI},
        knee: {min: -0.7 * Math.PI, max: 0.1 * Math.PI},
        shoulder: {min: -0.8 * Math.PI, max: 0.8 * Math.PI},
        hip: {min: -0.6 * Math.PI, max: 0.6 * Math.PI}
    },
    
    // Rigidité (0-1)
    JOINT_STIFFNESS: 0.8,
    JOINT_DAMPING: 0.3,
    
    // Physique environnement
    AIR_RESISTANCE: 0.98,
    GROUND_FRICTION: 0.85,
    BOUNCE_FACTOR: 0.3,
    
    // Durées (ms)
    RAGDOLL_MIN_DURATION: 1000,
    RAGDOLL_MAX_DURATION: 3000,
    RECOVERY_DURATION: 800
};
```

---

## Points d'Intégration

### 1. GameRoom.js (Serveur)

**Ajouter dans constructor:**
```javascript
const RagdollPhysicsService = require('./physics/RagdollPhysicsService');
this.ragdollService = new RagdollPhysicsService({
    gravity: GRAVITY,
    timeStep: T_INC
});
```

**Modifier addPlayer:**
```javascript
addPlayer(socket, name) {
    // ... code existant ...
    const ragdoll = this.ragdollService.createRagdoll(
        socket.id,
        player.x,
        player.y,
        player.isPlayer1
    );
    player.ragdoll = ragdoll;
    return role;
}
```

**Modifier updatePhysics (lors d'un hit):**
```javascript
if (p1HitP2) {
    const contactPoint = {
        x: p2.x + Math.cos(ejectionAngle) * 25,
        y: p2.y + Math.sin(ejectionAngle) * 25
    };
    this.ragdollService.setRagdollEnabled(p2.id, true);
    this.ragdollService.applyImpact(p2.id, ejectionAngle, p2.damage * 2, contactPoint);
    // ... reste du code ...
}
```

**Modifier broadcastFullState:**
```javascript
broadcastFullState() {
    // ... code existant pour scores et joueurs ...
    
    // Ajouter données ragdoll pour chaque joueur
    for (const pid of [p1Id, p2Id]) {
        if (pid && this.players[pid].ragdoll) {
            const ragdollData = this.ragdollService.serializeRagdoll(pid);
            // Append to buffer
        }
    }
}
```

### 2. rendering.js (Client)

**Ajouter dans constructor:**
```javascript
import {RagdollAnimationService} from './modules/ragdoll/RagdollAnimationService.js';
import {RagdollRenderer} from './modules/ragdoll/RagdollRenderer.js';

this.ragdollService = new RagdollAnimationService(this.network);
this.ragdollRenderer = new RagdollRenderer(this.ctx);
```

**Modifier drawPlayers:**
```javascript
drawPlayers(players) {
    for (const id in players) {
        const p = players[id];
        
        if (p.ragdollEnabled) {
            const state = this.ragdollService.getRagdollState(id);
            this.ragdollRenderer.drawRagdoll(state, id, {
                color: p.color,
                glowColor: p.color,
                lineWidth: 4
            });
        } else {
            // Code existant (sphère)
            this.drawPlayerModel(ctx, p, id);
        }
    }
}
```

---

## Questions pour l'IA

### Choix Techniques
1. Recommandez-vous un moteur physique existant (Matter.js) ou implémentation custom?
2. Pour IK 2D, quel algorithme est optimal (FABRIK, CCD, analytique)?
3. Comment gérer l'interpolation à 20Hz serveur pour rendu smooth 60fps client?

### Optimisations
4. Stratégie pour minimiser allocations mémoire par frame?
5. Comment optimiser résolution contraintes (itérations minimales)?
6. Faut-il spatial partitioning pour collisions (si 4+ joueurs futurs)?

### Stabilité
7. Comment éviter explosions physiques en cas de fortes contraintes?
8. Gestion des joints coincés dans murs?
9. Stratégie de fallback si physique devient instable?

### Animation
10. Comment transition smooth entre ragdoll et contrôle normal?
11. Durée optimale de récupération pour bon gameplay?
12. Faut-il blend IK et physique pour certaines poses?

---

## Livrables Attendus

1. **Code source** de toutes les classes listées
2. **Tests unitaires** (Jest ou équivalent)
3. **Documentation** des algorithmes utilisés
4. **Exemple d'utilisation** minimal
5. **Guide de tuning** des paramètres physiques

---

## Format de Réponse Souhaité

Pour chaque classe implémentée, fournir:
```javascript
/**
 * Description claire
 * Algorithme utilisé: [nom]
 * Complexité: O(?)
 * Dépendances: [liste]
 */
class MyClass {
    // Code complet avec commentaires
}

// Tests
describe('MyClass', () => {
    it('should...', () => {
        // Test cases
    });
});
```

---

## Ressources

- **Code existant à respecter**: Player.js, GameRoom.js, rendering.js
- **Style visuel**: Neon, glow effects (voir rendering.js lignes 479-510)
- **Protocole binaire**: Voir network.js ligne 87-173
- **Physique actuelle**: Voir Player.js ligne 50-150

---

**Prêt pour consultation IA**. Document à fournir avec le code source existant des fichiers mentionnés.
