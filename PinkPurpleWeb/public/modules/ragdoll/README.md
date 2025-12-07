# Ragdoll System - README

## 🎯 Vue d'Ensemble

Ce dossier contient le système de ragdoll et d'animations procédurales pour PinkPurple.

**Status**: 🚧 En préparation - Stubs prêts pour implémentation par IA spécialisée

---

## 📁 Structure

```
public/modules/ragdoll/
├── README.md (ce fichier)
├── RagdollAnimationService.js  - Service principal animation
├── RagdollRenderer.js          - Rendu Canvas 2D
├── ProceduralAnimator.js       - Générateur animations
└── IKSolver.js                 - Inverse Kinematics 2D
```

---

## 🔧 Architecture

### RagdollAnimationService
**Rôle**: Orchestration côté client
- Reçoit états binaires du serveur
- Interpole pour rendu smooth (20Hz → 60fps)
- Gère animations procédurales
- Interface avec renderer

### RagdollRenderer
**Rôle**: Rendu visuel
- Dessine membres et articulations
- Style neon cohérent avec jeu
- Effets visuels (glow, motion blur)
- Canvas 2D API

### ProceduralAnimator
**Rôle**: Génération d'animations
- Animations d'impact
- Animations de chute
- Animations de récupération
- Animation swing de batte
- Pure functions (stateless)

### IKSolver
**Rôle**: Calculs de poses
- IK 2-joints (bras, jambes)
- IK corps complet
- Algorithme: FABRIK ou CCD
- Résolution 2D optimisée

---

## 🔌 Intégration

### Dans rendering.js

```javascript
import {RagdollAnimationService} from './ragdoll/RagdollAnimationService.js';
import {RagdollRenderer} from './ragdoll/RagdollRenderer.js';

// Dans constructor
this.ragdollService = new RagdollAnimationService(this.network);
this.ragdollRenderer = new RagdollRenderer(this.ctx);

// Dans drawPlayers
if (p.ragdollEnabled) {
    const state = this.ragdollService.getRagdollState(id);
    this.ragdollRenderer.drawRagdoll(state, id, {
        color: p.color,
        glowColor: p.color,
        lineWidth: 4
    });
} else {
    // Dessin normal (sphère)
    this.drawPlayerModel(ctx, p, id);
}
```

### Dans network.js

```javascript
// Nouveau listener pour états ragdoll
this.socket.on('ragdoll_state', (buf) => {
    this.ragdollService.updateRagdollState(playerId, buf);
});
```

---

## 📊 Protocole de Communication

### Format Binaire (36 bytes)

```
[0]     Flags (Uint8)
        - Bit 0: Ragdoll enabled
        - Bit 1: Grounded
        - Bit 2-7: Reserved

[1-4]   Center of mass X, Y (Int16LE * 10)

[5]     Limb count (10)

[6-35]  Limbs (3 bytes each):
        - Angle * 1000 (Int16LE, 2 bytes)
        - Flags (Uint8, 1 byte)
```

### Désérialisation

```javascript
function deserializeRagdoll(buffer) {
    const data = new Uint8Array(buffer);
    const flags = data[0];
    const centerX = ((data[2] << 8) | data[1]) / 10;
    const centerY = ((data[4] << 8) | data[3]) / 10;
    
    const limbs = [];
    for (let i = 0; i < 10; i++) {
        const offset = 6 + i * 3;
        const angle = ((data[offset+1] << 8) | data[offset]) / 1000;
        limbs.push({angle});
    }
    
    return {flags, centerX, centerY, limbs};
}
```

---

## 🎨 Style Visuel

### Neon Glow (à reproduire)

```javascript
// Basé sur rendering.js ligne 479-510
drawLimb(limb, style) {
    const ctx = this.ctx;
    
    ctx.save();
    ctx.translate(limb.x, limb.y);
    ctx.rotate(limb.angle);
    
    // Fill semi-transparent
    ctx.shadowBlur = 0;
    ctx.fillStyle = style.color;
    ctx.globalAlpha = 0.2;
    ctx.fillRect(-limb.length/2, -2, limb.length, 4);
    
    ctx.globalAlpha = 1.0;
    
    // Stroke avec glow
    ctx.lineWidth = style.lineWidth;
    ctx.strokeStyle = '#ffffff';
    ctx.shadowColor = style.glowColor;
    ctx.shadowBlur = 20;
    ctx.strokeRect(-limb.length/2, -2, limb.length, 4);
    
    ctx.restore();
}
```

---

## ⚡ Performance

### Objectifs
- **Interpolation**: < 0.5ms par ragdoll
- **Rendu**: < 1ms par ragdoll (incluant glow)
- **Total**: < 1.5ms pour 2 ragdolls @ 60fps

### Optimisations
- Pré-calculer angles
- Réutiliser objets (éviter GC)
- Cache des transformations
- Skip interpolation si pas de mouvement

---

## 🧪 Tests

### Tests Unitaires (à créer)

```javascript
describe('RagdollAnimationService', () => {
    it('should deserialize server state correctly', () => {
        // Test désérialisation
    });
    
    it('should interpolate positions smoothly', () => {
        // Test interpolation
    });
});

describe('RagdollRenderer', () => {
    it('should render limbs with neon style', () => {
        // Test rendu
    });
});

describe('ProceduralAnimator', () => {
    it('should generate realistic impact animation', () => {
        // Test animation
    });
});

describe('IKSolver', () => {
    it('should solve 2-joint IK correctly', () => {
        // Test IK
    });
});
```

---

## 📚 Documentation Complète

Voir dossier `docs/`:
- `ragdoll-system-spec.md` - Spécification technique
- `ragdoll-api-reference.md` - Référence API
- `ragdoll-implementation-plan.md` - Plan d'implémentation
- `ragdoll-files-for-ai.md` - Guide pour IA

---

## 🚀 Status d'Implémentation

### RagdollAnimationService.js
- [x] Structure et signatures
- [ ] Désérialisation binaire
- [ ] Interpolation
- [ ] Gestion des animations
- [ ] Tests

### RagdollRenderer.js
- [x] Structure et signatures
- [ ] Rendu membres
- [ ] Rendu joints
- [ ] Style neon
- [ ] Effets visuels
- [ ] Tests

### ProceduralAnimator.js
- [x] Structure et signatures
- [ ] Animation impact
- [ ] Animation chute
- [ ] Animation récupération
- [ ] Animation swing
- [ ] Tests

### IKSolver.js
- [x] Structure et signatures
- [ ] Algorithme 2-joint
- [ ] Algorithme corps complet
- [ ] Optimisations
- [ ] Tests

---

## 🤝 Contribution

Ce code sera implémenté par une IA spécialisée selon les spécifications.

Les modifications manuelles doivent respecter:
- Style de code existant
- Signatures définies dans stubs
- Performance requirements
- Tests obligatoires

---

**Prêt pour implémentation !** 🎉
