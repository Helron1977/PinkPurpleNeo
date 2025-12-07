# Plan Ragdoll System - Préparation pour IA Spécialisée

## ✅ Ce qui a été préparé

### 📚 Documentation Complète

1. **ragdoll-system-spec.md** (Spécification technique)
   - Architecture complète
   - Structure des fichiers
   - Signatures de toutes les méthodes
   - Protocole de communication binaire
   - Plan d'implémentation en 5 phases
   - Paramètres de configuration
   - Points d'attention

2. **ragdoll-api-reference.md** (Référence API pour IA)
   - Interfaces TypeScript-style
   - Contraintes techniques (performance, stabilité)
   - Format binaire détaillé
   - Points d'intégration avec code existant
   - Questions à poser à l'IA
   - Livrables attendus

### 🏗️ Structure de Code (Stubs)

#### Serveur (Node.js)
```
server/physics/
├── RagdollPhysicsService.js  ✅ Service principal
├── RagdollBody.js             ✅ Corps ragdoll
├── Limb.js                    ✅ Membre individuel
└── Joint.js                   ✅ Articulation
```

#### Client (JavaScript)
```
public/modules/ragdoll/
├── RagdollAnimationService.js ✅ Service animation
├── RagdollRenderer.js         ✅ Rendu Canvas 2D
├── ProceduralAnimator.js      ✅ Animations procédurales
└── IKSolver.js                ✅ Inverse Kinematics
```

### 📝 Caractéristiques des Stubs

Chaque fichier contient :
- ✅ **Signature complète** de toutes les méthodes
- ✅ **Documentation JSDoc** détaillée
- ✅ **Structure de base** (constructor, propriétés)
- ✅ **Commentaires "TODO"** pour l'IA
- ✅ **throw Error('Not implemented')** pour repérer facilement ce qui manque

---

## 📋 Pour Consulter l'IA Spécialisée

### Documents à Fournir

1. **Spécifications**:
   - `docs/ragdoll-system-spec.md`
   - `docs/ragdoll-api-reference.md`

2. **Code Existant** (pour contexte):
   - `server/entities/Player.js` (physique actuelle)
   - `server/core/GameRoom.js` (boucle de jeu)
   - `public/modules/rendering.js` (rendu actuel)
   - `public/modules/network.js` (protocole binaire)

3. **Stubs Préparés**:
   - Tous les fichiers dans `server/physics/`
   - Tous les fichiers dans `public/modules/ragdoll/`

### Questions Clés à Poser

#### Choix Techniques
1. **Moteur physique**: Custom ou Matter.js?
   - Avantages/inconvénients de chaque
   - Performance attendue
   - Complexité d'intégration

2. **Algorithme IK**: FABRIK, CCD ou analytique?
   - Rapidité d'exécution
   - Précision
   - Facilité d'implémentation 2D

3. **Interpolation**: Comment gérer 20Hz serveur -> 60fps client?
   - Prédiction?
   - Interpolation linéaire ou courbe?

#### Optimisations
4. **Allocations mémoire**: Comment minimiser GC pauses?
5. **Résolution contraintes**: Nombre d'itérations optimal?
6. **Collisions**: Spatial partitioning nécessaire?

#### Stabilité
7. **Explosions physiques**: Comment éviter?
8. **Membres coincés**: Stratégie de récupération?
9. **Fallback**: Que faire si instable?

#### Animation
10. **Transitions**: Ragdoll <-> contrôle normal smooth?
11. **Durée récupération**: Optimal pour gameplay?
12. **Blend IK/physique**: Pour certaines poses?

---

## 🎯 Prompt Suggéré pour IA

```
Je développe un jeu multijoueur 2D en JavaScript (Node.js serveur, Canvas 2D client) et je veux implémenter un système de ragdoll avec animations procédurales.

CONTEXTE:
- Jeu de combat avec joueurs actuellement sphériques
- Physique serveur à 60 FPS, broadcast réseau à 20 Hz
- Protocole binaire optimisé (voir network.js)
- Style visuel: Neon glow (voir rendering.js)

J'AI PRÉPARÉ:
1. Spécification technique complète (ragdoll-system-spec.md)
2. Référence API avec toutes les signatures (ragdoll-api-reference.md)
3. Stubs de code avec structure et documentation
4. Points d'intégration avec code existant

JE DEMANDE:
Implémentation complète des classes suivantes avec:
- Code production-ready (pas de pseudo-code)
- Tests unitaires
- Optimisations performance
- Gestion stabilité physique

PRIORITÉS:
1. Performance (< 2ms physique, < 1ms rendu par ragdoll)
2. Stabilité (pas d'explosions, convergence garantie)
3. Réalisme (contraintes anatomiques, réactions cohérentes)
4. Intégration propre (autonome, testable)

LIVRABLES:
- [ ] RagdollPhysicsService.js (complet)
- [ ] RagdollBody.js (complet)
- [ ] Limb.js (complet)
- [ ] Joint.js (complet)
- [ ] RagdollAnimationService.js (complet)
- [ ] RagdollRenderer.js (complet)
- [ ] ProceduralAnimator.js (complet)
- [ ] IKSolver.js (complet)
- [ ] Tests unitaires pour chaque classe
- [ ] Documentation des algorithmes

QUESTIONS:
[Insérer les 12 questions listées ci-dessus]

Peux-tu commencer par répondre aux questions techniques, puis implémenter les classes dans l'ordre de dépendance?
```

---

## 📐 Architecture Résumée

### Flux de Données

```
SERVEUR (60 FPS):
Player hit detected
     ↓
RagdollPhysicsService.applyImpact()
     ↓
RagdollBody.applyImpulseToLimb()
     ↓
Limb physics update (Verlet)
     ↓
Joint.solve() (contraintes)
     ↓
RagdollBody.serialize()
     ↓
Binary protocol (20 Hz)
     ↓

CLIENT (60 FPS):
Receive binary state
     ↓
RagdollAnimationService.updateRagdollState()
     ↓
Interpolation (20Hz -> 60fps)
     ↓
ProceduralAnimator (optional effects)
     ↓
RagdollRenderer.drawRagdoll()
     ↓
Canvas 2D (avec glow effects)
```

### Dépendances

```
Serveur:
Joint ← Limb ← RagdollBody ← RagdollPhysicsService
                                      ↓
                                 GameRoom (intégration)

Client:
IKSolver ← ProceduralAnimator ← RagdollAnimationService
                                        ↓
RagdollRenderer ← rendering.js (intégration)
```

---

## ✨ Fonctionnalités Attendues

### Phase 1: Physique de Base
- [x] Structure préparée
- [ ] Physique Verlet pour Limb
- [ ] Contraintes angulaires pour Joint
- [ ] Assemblage RagdollBody
- [ ] Service de gestion

### Phase 2: Réseau
- [x] Format binaire défini
- [ ] Sérialisation serveur
- [ ] Désérialisation client
- [ ] Intégration GameRoom

### Phase 3: Rendu
- [x] Structure préparée
- [ ] Rendu membres/joints
- [ ] Style neon cohérent
- [ ] Interpolation smooth

### Phase 4: Animations
- [ ] IK Solver 2D
- [ ] Animation impact
- [ ] Animation chute
- [ ] Animation récupération
- [ ] Animation swing batte

### Phase 5: Polish
- [ ] Motion blur
- [ ] Optimisations
- [ ] Tuning paramètres
- [ ] Tests performance

---

## 📊 Estimation

### Temps de Développement
- **Avec IA spécialisée**: 3-5 jours
- **Sans IA**: 11-17 jours

### Complexité par Composant
- **Limb** (physique): ⭐⭐⭐ (moyenne)
- **Joint** (contraintes): ⭐⭐⭐⭐ (élevée)
- **RagdollBody** (assemblage): ⭐⭐⭐⭐ (élevée)
- **IKSolver**: ⭐⭐⭐⭐⭐ (très élevée)
- **ProceduralAnimator**: ⭐⭐⭐⭐ (élevée)
- **Renderer**: ⭐⭐ (faible, style existant)

---

## 🚀 Prochaines Étapes

1. ✅ **Préparation terminée**
2. **Review** de ce plan
3. **Consulter IA** avec documentation + stubs
4. **Implémenter** selon ordre de dépendance
5. **Tester** chaque composant
6. **Intégrer** progressivement
7. **Tuner** paramètres pour gameplay
8. **Polish** effets visuels

---

## 📁 Fichiers Créés

### Documentation
- [x] `docs/ragdoll-system-spec.md`
- [x] `docs/ragdoll-api-reference.md`
- [x] `docs/ragdoll-implementation-plan.md` (ce fichier)

### Code Serveur
- [x] `server/physics/RagdollPhysicsService.js`
- [x] `server/physics/RagdollBody.js`
- [x] `server/physics/Limb.js`
- [x] `server/physics/Joint.js`

### Code Client
- [x] `public/modules/ragdoll/RagdollAnimationService.js`
- [x] `public/modules/ragdoll/RagdollRenderer.js`
- [x] `public/modules/ragdoll/ProceduralAnimator.js`
- [x] `public/modules/ragdoll/IKSolver.js`

**Total**: 11 fichiers prêts pour l'IA 🎉

---

## 💡 Conseils

### Pour l'IA
- Fournir **tout le contexte** (spécs + code existant + stubs)
- Demander **implémentation incrémentale** (composant par composant)
- Insister sur **tests unitaires** pour chaque classe
- Demander **explication des algorithmes** utilisés

### Pendant l'Implémentation
- **Tester** chaque composant isolément avant intégration
- **Commencer petit**: un ragdoll statique avant animations
- **Tuner progressivement**: valeurs par défaut puis affiner
- **Versionner**: commit après chaque composant fonctionnel

### Tests
- **Serveur**: `npm test` (si Jest configuré)
- **Client**: Tests manuels d'abord, puis automatiser
- **Performance**: `console.time()` pour mesurer
- **Stabilité**: Laisser tourner longtemps, vérifier pas d'explosion

---

**Vous êtes prêt pour consulter une IA spécialisée !** 🚀

Tout est documenté, structuré et prêt à être implémenté.
