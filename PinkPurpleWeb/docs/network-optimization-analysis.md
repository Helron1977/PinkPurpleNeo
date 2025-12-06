# Analyse de la Communication Serveur - PinkPurple

## État Actuel (Protocole Binaire)

### Données Transférées par Frame

Le serveur envoie actuellement un buffer binaire avec la structure suivante :

```
[0] P1 Score (Uint8) - 1 byte
[1] P2 Score (Uint8) - 1 byte
[2-7] P1 Data (6 bytes)
  - [2] Flags (Uint8): Active, IsHit, GrenadeCount(2bits), Facing, VictoryStance
  - [3] Damage (Uint8)
  - [4-5] X coordinate (Int16LE * 10)
  - [6-7] Y coordinate (Int16LE * 10)
[8-13] P2 Data (6 bytes) - même structure
[14] Grenade Count (Uint8) - 1 byte
[15+] Grenades (5 bytes each)
  - X (Int16LE * 10) - 2 bytes
  - Y (Int16LE * 10) - 2 bytes
  - Age (Uint8) - 1 byte
```

**Taille minimale**: 15 bytes (sans grenades)
**Taille maximale**: 15 + (N grenades * 5) bytes

### Événements Séparés (JSON)

En plus du protocole binaire, le serveur envoie des événements séparés en JSON :
- `hit` : { type, from, to, damage }
- `swing` : { type, player }
- `death` : { type, player }
- `bounce` : { type, player }
- `grenade_explode` : { type, x, y, radius }
- `grenade_hit` : { type, target, damage }

## Opportunités d'Optimisation

### 1. Éliminer les Événements Redondants

**Problème**: Certains événements peuvent être déduits de l'état binaire
- `swing` : Peut être déduit de isHit flag
- `bounce` : Pourrait être déduit de la vélocité/position

**Solution**: Encoder ces événements dans les flags du protocole binaire

### 2. Compresser les Coordonnées

**Actuel**: Int16LE * 10 (range: -3276.8 à 3276.7)
**Terrain**: 1920x1080

**Optimisation possible**:
- Utiliser Uint16 (0-65535) et diviser par 10
- Range: 0-6553.5 (largement suffisant)
- Économie: Pas de gain en bytes, mais simplification du décodage

### 3. Delta Compression

**Problème**: On envoie l'état complet à chaque frame
**Solution**: N'envoyer que les changements depuis le dernier état

**Exemple**:
```
Frame 1: État complet (15 bytes)
Frame 2: Delta (seulement les positions qui ont changé, ~6 bytes)
Frame 3: Delta (~6 bytes)
Frame 4: État complet (tous les 10 frames pour resync)
```

**Économie estimée**: ~60% de réduction de bande passante

### 4. Regrouper les Événements dans le Buffer Binaire

**Actuel**: Événements séparés en JSON
**Optimisé**: Ajouter une section "events" au buffer binaire

```
[...état actuel...]
[N] Event Count (Uint8)
[N+1+] Events (format compact)
  - Type (Uint8): 0=hit, 1=death, 2=bounce, etc.
  - Data (variable selon type)
```

**Économie**: JSON overhead (~50-100 bytes) → ~2-5 bytes par événement

### 5. Optimiser les Flags

**Actuel**: 1 byte de flags par joueur (8 bits disponibles)
**Utilisé**: 6 bits (Active, IsHit, GrenadeCount×2, Facing, VictoryStance)
**Disponible**: 2 bits

**Nouveaux flags possibles**:
- Bit 6: IsSwinging (pour remplacer événement swing)
- Bit 7: JustBounced (pour remplacer événement bounce)

## Recommandations Prioritaires

### Phase 1: Quick Wins (Immédiat)
1. ✅ **Regrouper les événements dans le buffer binaire** (économie: ~50 bytes/frame)
2. ✅ **Utiliser les flags inutilisés** (éliminer 2 événements JSON)

### Phase 2: Optimisation Moyenne (Court terme)
3. **Delta compression** (économie: ~60% de bande passante)
4. **Optimiser le format des grenades** (stocker seulement si actives)

### Phase 3: Optimisation Avancée (Long terme)
5. **Prédiction côté client** (interpolation entre frames)
6. **Compression zlib** (pour les gros états)

## Impact Estimé

### Avant Optimisation
- État: ~15-30 bytes/frame (60 FPS) = 900-1800 bytes/sec
- Événements: ~5-10 événements/sec × 50 bytes = 250-500 bytes/sec
- **Total: ~1150-2300 bytes/sec par joueur**

### Après Phase 1
- État: ~15-30 bytes/frame
- Événements: ~2-5 bytes/frame (intégrés)
- **Total: ~1020-2100 bytes/sec (-11%)**

### Après Phase 2 (avec delta)
- État: ~6-12 bytes/frame (moyenne)
- Événements: ~2-5 bytes/frame
- **Total: ~480-1020 bytes/sec (-58%)**

## Conclusion

Le protocole binaire actuel est déjà très efficace. Les optimisations majeures viendront de:
1. L'intégration des événements dans le buffer binaire
2. La delta compression pour ne pas renvoyer l'état complet à chaque frame

Ces optimisations sont recommandées si vous visez:
- Support de plus de 2 joueurs simultanés
- Réduction des coûts de bande passante serveur
- Amélioration de la performance sur connexions lentes
