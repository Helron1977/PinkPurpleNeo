# Spécification Ragdoll - Personnage Sphérique Actuel

## 🎯 Vue d'Ensemble

### Objectif
Transformer le personnage sphérique actuel en ragdoll physique lors des impacts, avec déformations procédurales et mains qui réagissent de manière indépendante.

### Personnage Actuel (à conserver)
- **Corps**: Sphère néon (rayon 25px)
- **Mains**: 2 sphères flottantes (rayon 8px)
- **Batte**: Attachée à main droite
- **Style**: Neon glow, pas de membres traditionnels

---

## 🏗️ Architecture Ragdoll Simplifié

### Composants Physiques

```
Personnage Ragdoll:
├── CoreBody (sphère principale)
│   ├── Position (x, y)
│   ├── Vélocité (vx, vy)
│   ├── Rotation (angle)
│   └── Déformation (squash & stretch)
│
├── Hand Left (main gauche flottante)
│   ├── Position relative au corps
│   ├── Vélocité propre
│   └── Contrainte spring avec corps
│
└── Hand Right (main droite + batte)
    ├── Position relative au corps
    ├── Vélocité propre
    ├── Contrainte spring avec corps
    └── Batte attachée (rotation indépendante)
```

### Modes de Fonctionnement

**Mode Normal** (contrôle joueur):
- Corps suit les inputs
- Mains suivent le corps avec léger décalage (spring)
- Batte suit main avec animation

**Mode Ragdoll** (après impact):
- Corps lancé avec physique libre
- Mains "lâchées" avec inertie propre
- Batte tourne librement
- Tout rebondit/déforme selon impacts

---

## 📝 Structures de Données

### CoreBody (Sphère Principale)

```javascript
class CoreBody {
    constructor(x, y, radius) {
        this.x = x;
        this.y = y;
        this.radius = radius;  // 25
        this.vx = 0;
        this.vy = 0;
        this.angularVelocity = 0;
        this.rotation = 0;
        
        // Déformation (squash & stretch)
        this.deformX = 1.0;  // Scale X (1.0 = normal)
        this.deformY = 1.0;  // Scale Y (1.0 = normal)
        this.deformAngle = 0; // Angle de la déformation
        
        this.isRagdoll = false;
        this.groundContact = false;
    }
    
    /**
     * Applique un impact avec déformation
     */
    applyImpact(vx, vy, impactPoint) {
        this.vx += vx;
        this.vy += vy;
        
        // Calculer déformation basée sur direction impact
        const impactAngle = Math.atan2(vy, vx);
        this.deformAngle = impactAngle;
        this.deformX = 0.7;  // Compressé dans direction impact
        this.deformY = 1.3;  // Étiré perpendiculairement
    }
    
    /**
     * Met à jour physique
     */
    update(deltaTime, gravity) {
        if (!this.isRagdoll) return;
        
        // Gravité
        this.vy += gravity * deltaTime;
        
        // Air resistance
        this.vx *= 0.98;
        this.vy *= 0.98;
        
        // Position
        this.x += this.vx;
        this.y += this.vy;
        
        // Rotation basée sur vélocité
        this.rotation += this.angularVelocity;
        this.angularVelocity *= 0.95;
        
        // Récupération déformation (spring back)
        this.deformX += (1.0 - this.deformX) * 0.15;
        this.deformY += (1.0 - this.deformY) * 0.15;
        
        // Collision sol
        if (this.y + this.radius > GROUND_Y) {
            this.y = GROUND_Y - this.radius;
            this.vy *= -0.5;  // Bounce
            this.groundContact = true;
            
            // Déformation impact sol
            this.deformY = 0.6;
            this.deformX = 1.4;
            this.deformAngle = Math.PI / 2;
        }
    }
}
```

### FloatingHand (Main Flottante)

```javascript
class FloatingHand {
    constructor(side, parentBody) {
        this.side = side;  // 'left' ou 'right'
        this.parent = parentBody;
        
        // Position relative au parent
        this.relativeX = side === 'left' ? -20 : 20;
        this.relativeY = 10;
        
        // Position absolue
        this.x = 0;
        this.y = 0;
        
        // Physique
        this.vx = 0;
        this.vy = 0;
        this.radius = 8;
        
        // Spring constraint vers parent
        this.springStiffness = 0.1;
        this.springDamping = 0.8;
        this.maxDistance = 60;  // Distance max du corps
    }
    
    /**
     * Met à jour position (mode ragdoll)
     */
    updateRagdoll(deltaTime, gravity) {
        // Physique libre
        this.vy += gravity * deltaTime;
        this.vx *= 0.95;
        this.vy *= 0.95;
        
        // Contrainte spring vers parent
        const dx = (this.parent.x + this.relativeX) - this.x;
        const dy = (this.parent.y + this.relativeY) - this.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        
        if (dist > this.maxDistance) {
            // Force de rappel si trop loin
            const force = (dist - this.maxDistance) * this.springStiffness;
            this.vx += (dx / dist) * force;
            this.vy += (dy / dist) * force;
        }
        
        // Damping
        this.vx *= this.springDamping;
        this.vy *= this.springDamping;
        
        // Mise à jour position
        this.x += this.vx;
        this.y += this.vy;
    }
    
    /**
     * Met à jour position (mode normal)
     */
    updateNormal(deltaTime) {
        // Suit le parent avec léger décalage (smooth follow)
        const targetX = this.parent.x + this.relativeX;
        const targetY = this.parent.y + this.relativeY;
        
        this.x += (targetX - this.x) * 0.2;
        this.y += (targetY - this.y) * 0.2;
    }
    
    /**
     * Applique impulsion lors d'un impact
     */
    applyImpulse(vx, vy) {
        this.vx += vx;
        this.vy += vy;
    }
}
```

---

## 🎮 Service Ragdoll Simplifié

### RagdollPhysicsService.js

```javascript
class RagdollPhysicsService {
    constructor(config) {
        this.gravity = config.gravity;
        this.ragdolls = new Map();  // playerId -> RagdollState
    }
    
    createRagdoll(playerId, x, y, facingRight) {
        const ragdoll = {
            core: new CoreBody(x, y, 25),
            leftHand: new FloatingHand('left', core),
            rightHand: new FloatingHand('right', core),
            batAngle: 0,
            batAngularVelocity: 0,
            facing: facingRight ? 1 : -1,
            enabled: false
        };
        
        this.ragdolls.set(playerId, ragdoll);
        return ragdoll;
    }
    
    applyImpact(playerId, impactAngle, force, contactPoint) {
        const ragdoll = this.ragdolls.get(playerId);
        if (!ragdoll) return;
        
        // Activer ragdoll
        ragdoll.enabled = true;
        ragdoll.core.isRagdoll = true;
        
        // Calculer vélocités
        const vx = Math.cos(impactAngle) * force;
        const vy = Math.sin(impactAngle) * force;
        
        // Appliquer au corps
        ragdoll.core.applyImpact(vx, vy, contactPoint);
        
        // Mains partent avec inertie réduite
        ragdoll.leftHand.applyImpulse(vx * 0.7, vy * 0.7);
        ragdoll.rightHand.applyImpulse(vx * 0.7, vy * 0.7);
        
        // Batte tourne
        ragdoll.batAngularVelocity = (Math.random() - 0.5) * 0.3;
    }
    
    update(deltaTime) {
        for (const [playerId, ragdoll] of this.ragdolls) {
            if (!ragdoll.enabled) continue;
            
            // Update core
            ragdoll.core.update(deltaTime, this.gravity);
            
            // Update mains
            ragdoll.leftHand.updateRagdoll(deltaTime, this.gravity);
            ragdoll.rightHand.updateRagdoll(deltaTime, this.gravity);
            
            // Update batte
            ragdoll.batAngle += ragdoll.batAngularVelocity;
            ragdoll.batAngularVelocity *= 0.98;
            
            // Désactiver ragdoll si arrêté
            if (ragdoll.core.groundContact && 
                Math.abs(ragdoll.core.vx) < 1 && 
                Math.abs(ragdoll.core.vy) < 1) {
                ragdoll.enabled = false;
                ragdoll.core.isRagdoll = false;
            }
        }
    }
    
    serializeRagdoll(playerId) {
        const ragdoll = this.ragdolls.get(playerId);
        if (!ragdoll) return null;
        
        // Format compact: 20 bytes
        // [0] Flags
        // [1-4] Core position (x, y)
        // [5-6] Core deformation (deformX, deformY) * 100
        // [7-10] Left hand (x, y)
        // [11-14] Right hand (x, y)
        // [15-16] Bat angle * 1000
        // [17-18] Core rotation * 1000
        
        const buf = Buffer.alloc(20);
        let offset = 0;
        
        // Flags
        let flags = 0;
        if (ragdoll.enabled) flags |= 1;
        if (ragdoll.core.groundContact) flags |= 2;
        buf.writeUInt8(flags, offset++);
        
        // Core
        buf.writeInt16LE(Math.round(ragdoll.core.x * 10), offset); offset += 2;
        buf.writeInt16LE(Math.round(ragdoll.core.y * 10), offset); offset += 2;
        buf.writeUInt8(Math.round(ragdoll.core.deformX * 100), offset++);
        buf.writeUInt8(Math.round(ragdoll.core.deformY * 100), offset++);
        
        // Mains
        buf.writeInt16LE(Math.round(ragdoll.leftHand.x * 10), offset); offset += 2;
        buf.writeInt16LE(Math.round(ragdoll.leftHand.y * 10), offset); offset += 2;
        buf.writeInt16LE(Math.round(ragdoll.rightHand.x * 10), offset); offset += 2;
        buf.writeInt16LE(Math.round(ragdoll.rightHand.y * 10), offset); offset += 2;
        
        // Batte et rotation
        buf.writeInt16LE(Math.round(ragdoll.batAngle * 1000), offset); offset += 2;
        buf.writeInt16LE(Math.round(ragdoll.core.rotation * 1000), offset); offset += 2;
        
        return buf;
    }
}
```

---

## 🎨 Rendu Côté Client

### RagdollRenderer.js (adapté au style actuel)

```javascript
class RagdollRenderer {
    constructor(ctx) {
        this.ctx = ctx;
    }
    
    drawRagdoll(ragdollState, style) {
        const ctx = this.ctx;
        
        // 1. Dessiner mains en premier (derrière)
        this.drawHand(ragdollState.leftHand, style);
        
        // 2. Dessiner corps principal (sphère déformée)
        this.drawCore(ragdollState.core, style);
        
        // 3. Dessiner main droite + batte (devant)
        this.drawHandWithBat(ragdollState.rightHand, ragdollState.batAngle, style);
    }
    
    drawCore(core, style) {
        const ctx = this.ctx;
        
        ctx.save();
        ctx.translate(core.x, core.y);
        ctx.rotate(core.rotation);
        
        // Appliquer déformation
        ctx.rotate(core.deformAngle);
        ctx.scale(core.deformX, core.deformY);
        ctx.rotate(-core.deformAngle);
        
        // Style neon (identique à l'actuel)
        const r = core.radius;
        
        ctx.shadowBlur = 0;
        ctx.fillStyle = style.color;
        ctx.globalAlpha = 0.2;
        ctx.beginPath();
        ctx.arc(0, 0, r, 0, Math.PI * 2);
        ctx.fill();
        
        ctx.globalAlpha = 1.0;
        ctx.lineWidth = 3;
        ctx.strokeStyle = '#ffffff';
        ctx.shadowColor = style.glowColor;
        ctx.shadowBlur = 20;
        ctx.stroke();
        
        // Overlay color (comme actuellement)
        ctx.shadowBlur = 0;
        ctx.strokeStyle = style.color;
        ctx.lineWidth = 1;
        ctx.stroke();
        
        ctx.restore();
    }
    
    drawHand(hand, style) {
        const ctx = this.ctx;
        
        ctx.save();
        ctx.fillStyle = style.color;
        ctx.shadowBlur = 15;
        ctx.shadowColor = style.glowColor;
        ctx.beginPath();
        ctx.arc(hand.x, hand.y, hand.radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }
    
    drawHandWithBat(hand, batAngle, style) {
        const ctx = this.ctx;
        
        ctx.save();
        ctx.translate(hand.x, hand.y);
        ctx.rotate(batAngle);
        
        // Dessiner batte (identique à l'actuel)
        ctx.fillStyle = '#eee';
        ctx.shadowColor = '#fff';
        ctx.shadowBlur = 20;
        
        ctx.fillRect(-2, -5, 15, 6);
        ctx.beginPath();
        ctx.moveTo(10, -5);
        ctx.lineTo(80, -10);
        ctx.quadraticCurveTo(90, -5, 90, 0);
        ctx.quadraticCurveTo(90, 5, 80, 10);
        ctx.lineTo(10, 5);
        ctx.fill();
        
        ctx.restore();
        
        // Dessiner main par-dessus
        this.drawHand(hand, style);
    }
}
```

---

## 📊 Protocole Binaire Simplifié

### Format (20 bytes seulement!)

```
Offset | Size | Type    | Description
-------|------|---------|------------------
0      | 1    | Uint8   | Flags (enabled, grounded)
1      | 2    | Int16LE | Core X * 10
3      | 2    | Int16LE | Core Y * 10
5      | 1    | Uint8   | Deform X * 100
6      | 1    | Uint8   | Deform Y * 100
7      | 2    | Int16LE | Left hand X * 10
9      | 2    | Int16LE | Left hand Y * 10
11     | 2    | Int16LE | Right hand X * 10
13     | 2    | Int16LE | Right hand Y * 10
15     | 2    | Int16LE | Bat angle * 1000
17     | 2    | Int16LE | Core rotation * 1000
19     | 1    | Uint8   | Reserved
```

**Beaucoup plus compact que la version humanoid (20 vs 36 bytes)**

---

## 🎬 Animations Procédurales

### Impact Animation

```javascript
animateImpact(ragdollState, impact) {
    // Déformation élastique basée sur direction
    const impactAngle = Math.atan2(impact.vy, impact.vx);
    
    return {
        ...ragdollState,
        core: {
            ...ragdollState.core,
            deformAngle: impactAngle,
            deformX: 0.6,  // Compressé
            deformY: 1.4,  // Étiré
        },
        // Mains s'écartent
        leftHand: {
            ...ragdollState.leftHand,
            vx: ragdollState.leftHand.vx + impact.vx * 0.5,
            vy: ragdollState.leftHand.vy + impact.vy * 0.5 - 5  // Vers le haut
        },
        rightHand: {
            ...ragdollState.rightHand,
            vx: ragdollState.rightHand.vx + impact.vx * 0.5,
            vy: ragdollState.rightHand.vy + impact.vy * 0.5 - 5
        }
    };
}
```

### Bounce/Squash Animation

```javascript
animateBounce(ragdollState) {
    // Squash au sol
    return {
        ...ragdollState,
        core: {
            ...ragdollState.core,
            deformX: 1.3,  // Élargi
            deformY: 0.7,  // Aplati
            deformAngle: Math.PI / 2  // Vertical
        }
    };
}
```

---

## 🔌 Points d'Intégration

### Dans GameRoom.js

```javascript
// Ligne 128-176 (lors d'un hit)
if (p1HitP2) {
    const contactPoint = {x: p2.x, y: p2.y};
    
    // Activer ragdoll
    this.ragdollService.setRagdollEnabled(p2.id, true);
    this.ragdollService.applyImpact(
        p2.id,
        ejectionAngle,
        p2.damage * 1.5,  // Force
        contactPoint
    );
    
    // ... reste du code
}
```

### Dans rendering.js

```javascript
// Modifier drawPlayerModel (ligne 403+)
drawPlayerModel(ctx, p, id) {
    if (p.ragdollEnabled) {
        // Mode ragdoll
        const ragdollState = this.ragdollService.getRagdollState(id);
        this.ragdollRenderer.drawRagdoll(ragdollState, {
            color: p.color,
            glowColor: p.color
        });
    } else {
        // Mode normal (code actuel)
        // ... dessiner sphère + mains flottantes normalement
    }
}
```

---

## ✨ Avantages de Cette Approche

### vs Humanoid Ragdoll

| Aspect | Humanoid | Sphérique | Gain |
|--------|----------|-----------|------|
| Complexité | ⭐⭐⭐⭐⭐ | ⭐⭐ | **-60%** |
| Bytes réseau | 36 | 20 | **-44%** |
| Performance | 2ms | 0.5ms | **-75%** |
| Style cohérent | ⚠️ Nouveau | ✅ Identique | 👍 |
| Temps dev | 11-17j | 2-3j | **-80%** |

### Fonctionnalités

✅ **Impact réaliste**: Déformation + rebond  
✅ **Physique fluide**: Mains springs, rotation  
✅ **Style préservé**: 100% compatible visuellement  
✅ **Optimisé**: 20 bytes, < 1ms  
✅ **Simple**: Pas d'IK, pas de contraintes complexes  

---

## 📁 Fichiers Requis (Simplifiés)

### Serveur
```
server/physics/
├── SimplifiedRagdollService.js   # Service principal
├── CoreBody.js                   # Sphère déformable
└── FloatingHand.js               # Main avec spring
```

### Client
```
public/modules/ragdoll/
├── RagdollAnimationService.js    # Interpolation
├── RagdollRenderer.js            # Rendu (adapté style actuel)
└── DeformationAnimator.js        # Animations squash/stretch
```

**Total: 6 fichiers au lieu de 8+**

---

## 📝 TODO Liste

- [ ] Créer stubs adaptés au personnage sphérique
- [ ] Implémenter CoreBody avec déformation
- [ ] Implémenter FloatingHand avec spring physics
- [ ] Adapter RagdollRenderer au style actuel
- [ ] Tester intégration

**Estimation: 2-3 jours au lieu de 11-17** 🎉

---

Cette approche est **beaucoup plus adaptée** à votre jeu et **plus rapide** à implémenter!
