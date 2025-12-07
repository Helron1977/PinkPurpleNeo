# Fichiers de Code Existant à Fournir à l'IA

## Pour Contexte et Intégration

### 📦 Architecture Actuelle

#### Serveur (Node.js)

**server/constants.js**
```javascript
// Constantes physiques du jeu
const WIDTH = 1920;
const HEIGHT = 1080;
const GRAVITY = 8;
const T_INC = 0.2;
const R_MIN = 25;
const R_MAX = 30;
```
**Points pertinents**: Valeurs de gravité, dimensions, pas de temps

---

**server/entities/Player.js**
- Classe actuelle du joueur (sphérique)
- Physique de mouvement (dash, jump, slam)
- Gestion des grenades
- Méthode `update()` à comprendre

**Points d'intégration**:
- Ligne ~50: Physique actuelle (à remplacer par ragdoll en mode stunned)
- Ligne ~120: `prepareEjection()` (à adapter pour ragdoll)
- Ligne ~150: `applyPendingLaunch()` (transition important)

---

**server/core/GameRoom.js**
- Boucle de jeu principale
- Détection de hits
- Gestion des joueurs

**Points d'intégration**:
- Ligne 6-16: Constructor (ajouter ragdollService)
- Ligne 36-45: addPlayer (créer ragdoll)
- Ligne 128-176: Logique de hit (activer ragdoll, appliquer impact)
- Ligne 334+: broadcastState (ajouter données ragdoll)

---

#### Client (JavaScript ES6)

**public/modules/constants.js**
```javascript
export const GAME_CONFIG = {
    WIDTH: 1920,
    HEIGHT: 1080,
    PLAYER1_COLOR: '#9393D6',
    PLAYER2_COLOR: '#CD62D5',
    PLAYER_RADIUS: 25,
    // ...
};
```
**Points pertinents**: Couleurs, dimensions pour ragdoll

---

**public/modules/network.js**
- Gestion Socket.IO
- Décodage protocole binaire actuel
- Structure de listeners

**Points d'intégration**:
- Ligne 54-62: Listener `state_bin` (ajouter ragdoll data)
- Ligne 64-72: Ajouter listener `ragdoll_state`
- Ligne 87-173: `decodeBinaryState()` (exemple de désérialisation)

**À copier pour ragdoll**:
```javascript
// Pattern de désérialisation
const data = new Uint8Array(buf);
let offset = 0;
const value = ((data[offset + 1] << 8) | data[offset]) / 10;
offset += 2;
```

---

**public/modules/rendering.js**
- Rendu Canvas 2D actuel
- Style neon/glow
- Animations visuelles

**Points d'intégration**:
- Ligne 366-401: `drawPlayers()` (ajouter condition ragdoll)
- Ligne 403-736: `drawPlayerModel()` (style à reproduire)
- Ligne 479-510: **IMPORTANT** Style neon (à copier)

**Style actuel à reproduire**:
```javascript
// Ligne 479-510
const bodyColor = p.victoryStance ? '#ffd700' : p.color;
const glowColor = p.victoryStance ? '#ffd700' : p.color;

ctx.shadowBlur = 0;
ctx.fillStyle = bodyColor;
ctx.globalAlpha = 0.2;
ctx.beginPath();
ctx.arc(0, 0, r, 0, Math.PI * 2);
ctx.fill();

ctx.globalAlpha = 1.0;
ctx.lineWidth = 3;
ctx.strokeStyle = '#ffffff';
ctx.shadowColor = glowColor;
ctx.shadowBlur = 20;
ctx.stroke();
```

---

## 📋 Checklist pour IA

Fournir ces fichiers dans cet ordre:

### 1. Documentation (lire d'abord)
- [ ] `docs/ragdoll-system-spec.md` - Spécification complète
- [ ] `docs/ragdoll-api-reference.md` - API de référence
- [ ] `docs/ragdoll-implementation-plan.md` - Ce plan

### 2. Code Serveur Existant (contexte)
- [ ] `server/constants.js` - Constantes physiques
- [ ] `server/entities/Player.js` - Physique actuelle
- [ ] `server/core/GameRoom.js` - Boucle de jeu

### 3. Code Client Existant (contexte)
- [ ] `public/modules/constants.js` - Config client
- [ ] `public/modules/network.js` - Protocole binaire
- [ ] `public/modules/rendering.js` - Rendu et style

### 4. Stubs à Implémenter
- [ ] `server/physics/RagdollPhysicsService.js`
- [ ] `server/physics/RagdollBody.js`
- [ ] `server/physics/Limb.js`
- [ ] `server/physics/Joint.js`
- [ ] `public/modules/ragdoll/RagdollAnimationService.js`
- [ ] `public/modules/ragdoll/RagdollRenderer.js`
- [ ] `public/modules/ragdoll/ProceduralAnimator.js`
- [ ] `public/modules/ragdoll/IKSolver.js`

---

## 🎯 Instructions pour l'IA

```
Contexte:
J'ai ces fichiers de jeu existants [fournir 1-3].

J'ai préparé ces stubs [fournir 4] avec signatures complètes.

J'ai ces spécifications [fournir documentation].

Objectif:
Implémenter un système ragdoll qui s'intègre proprement au code existant.

Contraintes:
1. Respecter le style de code existant (voir Player.js, rendering.js)
2. Utiliser le même protocole binaire (voir network.js ligne 87+)
3. Reproduire le style visuel neon (voir rendering.js ligne 479-510)
4. Performance: < 2ms serveur, < 1ms client par ragdoll
5. Pas de dépendances externes lourdes

Questions avant implémentation:
[Insérer les 12 questions du plan]

Peux-tu:
1. Répondre aux questions techniques
2. Proposer les algorithmes à utiliser
3. Implémenter les classes dans l'ordre de dépendance
4. Fournir des tests unitaires
5. Documenter les choix techniques
```

---

## 📊 Ordre d'Implémentation Recommandé

### Phase 1: Fondations
1. **Limb.js** (physique de base)
2. **Joint.js** (contraintes)
3. **Tests Limb + Joint**

### Phase 2: Corps
4. **RagdollBody.js** (assemblage)
5. **RagdollPhysicsService.js** (service)
6. **Tests intégration serveur**

### Phase 3: Client Base
7. **RagdollRenderer.js** (rendu visuel)
8. **RagdollAnimationService.js** (désérialisation)
9. **Tests rendu**

### Phase 4: Animations
10. **IKSolver.js** (inverse kinematics)
11. **ProceduralAnimator.js** (animations)
12. **Tests animations**

### Phase 5: Intégration
13. Modifications GameRoom.js
14. Modifications rendering.js
15. Tests end-to-end

---

## 💡 Exemples de Code à Montrer

### Exemple: Protocole Binaire Actuel

**Sérialisation (serveur)**:
```javascript
// De GameRoom.js ligne 373-375
buf.writeInt16LE(Math.round(p.x * 10), offset); 
offset += 2;
buf.writeInt16LE(Math.round(p.y * 10), offset); 
offset += 2;
```

**Désérialisation (client)**:
```javascript
// De network.js ligne 114-117
const x = ((data[offset + 1] << 8) | data[offset]) / 10;
offset += 2;
const y = ((data[offset + 1] << 8) | data[offset]) / 10;
offset += 2;
```

### Exemple: Style Neon Actuel

```javascript
// De rendering.js ligne 497-510
ctx.shadowBlur = 0;
ctx.fillStyle = bodyColor;
ctx.globalAlpha = 0.2;
ctx.beginPath();
ctx.arc(0, 0, r, 0, Math.PI * 2);
ctx.fill();

ctx.globalAlpha = 1.0;
ctx.lineWidth = 3;
ctx.strokeStyle = '#ffffff';
ctx.shadowColor = glowColor;
ctx.shadowBlur = 20;
ctx.stroke();
```

**À reproduire pour chaque membre du ragdoll**

### Exemple: Applying Forces

```javascript
// De Player.js ligne 77-80 (dash actuel)
if (this.isDashing && this.dashTimer > 0) {
    this.vx += this.dashDir * 2;
    this.dashTimer--;
}
```

**Équivalent ragdoll: appliquer force à membre spécifique**

---

## 🔍 Points d'Attention Spécifiques

### Serveur
- **Pas de `require()` circulaires** (structure actuelle propre)
- **Exports CommonJS** (`module.exports = Class`)
- **Pas de types TypeScript** (pur JavaScript)
- **Performance critique** (60 FPS physique)

### Client
- **Modules ES6** (`import/export`)
- **Pas de bundler** (fichiers directs)
- **Canvas 2D uniquement** (pas de WebGL)
- **60 FPS rendering** obligatoire

### Style
- **Neon glow consistent** partout
- **Couleurs joueur** respectées
- **Animations smooth** (spring physics)
- **Motion blur** optionnel mais apprécié

---

**Prêt à fournir à l'IA !** 📨

Tous les fichiers sont listés, les exemples fournis, les contraintes claires.
