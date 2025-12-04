# 🎮 Écran d'Accueil PinkPurple

## 📁 **Fichiers créés**

### 1. **welcome.html**
- Écran d'accueil avec champ de saisie du nom
- Fond étoilé animé (3 couches de parallaxe)
- Titre néon animé PINK PURPLE
- Aperçu des contrôles
- Responsive mobile

### 2. **welcome.css**
- Design cyberpunk/synthwave
- Animations de glow néon
- Starfield animé en CSS pur
- Effets de hover interactifs
- Responsive design

### 3. **welcome.js**
- Générateur de musique synthwave procédurale
- Sauvegarde du nom dans localStorage
- Transition fluide vers le jeu
- Support touche ENTER
- Génération de noms aléatoires cool

## 🎵 **Musique Synthwave**

La musique est générée procéduralement avec Web Audio API :

**Caractéristiques** :
- ✅ **Pads dreamy** : Nappes de synthé atmosphériques
- ✅ **Bassline pulsante** : Basse qui pulse sur le beat
- ✅ **Arpèges** : Mélodies montantes/descendantes
- ✅ **Progression d'accords** : Am - F - C - G (dreamy)
- ✅ **Tempo** : 120 BPM
- ✅ **Loop** : 8 secondes

**Instruments** :
1. **Pad** : Sawtooth wave + lowpass filter (800Hz)
2. **Bass** : Sine wave (octave basse)
3. **Arp** : Square wave + lowpass filter (2000Hz)

## 🎯 **Fonctionnalités**

### **Saisie du nom**
- Champ de texte avec glow néon
- Sauvegarde automatique dans localStorage
- Génération de nom aléatoire si vide
- Maximum 12 caractères
- Uppercase automatique

### **Navigation**
- **ENTER** : Démarre le jeu
- **Clic sur bouton** : Démarre le jeu
- **Focus sur input** : Démarre la musique

### **Effets visuels**
- Starfield animé (3 couches)
- Glow néon sur le titre
- Pulse sur le bouton START
- Shake si nom vide
- Fade out lors de la transition

## 🚀 **Utilisation**

### **Accès**
```
http://localhost:3000/
```
Le serveur sert automatiquement `welcome.html` comme page d'accueil.

### **Flow utilisateur**
1. Page se charge avec starfield animé
2. Musique démarre au premier clic/focus
3. Utilisateur saisit son nom (ou garde le nom généré)
4. Appuie sur ENTER ou clique sur START
5. Transition vers `index.html` (lobby du jeu)

## 🎨 **Palette de couleurs**

| Élément | Couleur | Usage |
|---------|---------|-------|
| **Pink** | `#CD62D5` | Titre PINK |
| **Purple** | `#9393D6` | Titre PURPLE |
| **Cyan** | `#0ff` | Accents, bordures |
| **Background** | `#1B2735` → `#090A0F` | Gradient radial |

## 📱 **Responsive**

### **Desktop** (> 768px)
- Titre : 8rem
- Input : 500px width
- Contrôles : 4 colonnes

### **Mobile** (≤ 768px)
- Titre : 4rem
- Input : 90% width
- Contrôles : 2 colonnes
- Tailles réduites

## 🔧 **Personnalisation**

### **Changer la musique**
Modifiez dans `welcome.js` :
```javascript
const chords = [
    [220, 261.63, 329.63], // Am
    [174.61, 220, 261.63], // F
    // Ajoutez vos accords
];
```

### **Changer le tempo**
```javascript
const beatDuration = 0.5; // 120 BPM
// 0.4 = 150 BPM
// 0.6 = 100 BPM
```

### **Changer les couleurs**
Dans `welcome.css`, modifiez :
```css
.pink {
    color: #CD62D5; /* Votre couleur */
}
```

## ⚡ **Performance**

- **Musique** : Générée en temps réel (pas de fichier audio)
- **Starfield** : CSS pur (pas de Canvas)
- **Animations** : GPU-accelerated (transform, opacity)
- **Taille** : ~15KB total (HTML + CSS + JS)

## 🐛 **Notes**

- La musique démarre au premier clic (requis par les navigateurs)
- Le nom est sauvegardé dans localStorage
- La transition arrête la musique de l'écran d'accueil
- La musique du jeu démarre dans `index.html`

## 🎯 **Prochaines améliorations possibles**

1. **Particules** : Ajouter des particules flottantes
2. **Leaderboard** : Afficher les meilleurs scores
3. **Skins** : Choix de couleur du joueur
4. **Tutoriel** : Modal explicatif
5. **Settings** : Volume, qualité graphique

---

**Tout est prêt ! Rechargez http://localhost:3000/ pour voir l'écran d'accueil** 🚀
