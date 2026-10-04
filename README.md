# 🏥 JOTNA — Backend Webhook & Interface Admin Pharmacies

Système backend sécurisé pour la réception, l'horodatage, le stockage et la gestion des réponses envoyées depuis le formulaire Framer de **JOTNA**.

---

## 🌟 Fonctionnalités Incluses

1. **Webhook Sécurisé (`POST /api/webhook/framer`)**
   - Protection par clé secrète via l'en-tête HTTP `X-Webhook-Secret`.
   - Réception et séparation de l'ensemble des 13 champs du formulaire.
   - Horodatage automatique (date & heure précises de soumission).

2. **Interface Administrateur Web (Dashboard Glassmorphism)**
   - Écran de connexion sécurisé par jeton **JWT**.
   - Tableau de bord récapitulatif avec métriques en temps réel (Total soumissions, Intérêt programme pilote, Villes).
   - Recherche textuelle rapide & Filtres dynamiques (par ville, par intérêt pilote, par mode de gestion du stock).
   - Modal de consultation détaillée séparé en 3 rubriques ergonomiques.
   - Suppression individuelle de soumissions si besoin.

3. **Exportation des Données**
   - **Export CSV** en 1 clic compatible Excel / Google Sheets avec encodage UTF-8 (conservation des accents français É, È, À, etc.).

4. **Guide & Simulateur d'Intégration Framer Intégré**
   - Fenêtre d'aide directement dans le tableau de bord avec copie de l'URL, de la clé secrète et simulateur d'envoi d'exemples.

---

## 🚀 Démarrage Rapide

### 1. Démarrer le serveur Backend
Dans le dossier du projet, exécutez :

```bash
node server.js
```

Le serveur sera accessible sur : **`http://localhost:5000`**

### 2. Accéder à l'Interface Administrateur
Rendez-vous sur `http://localhost:5000` dans votre navigateur.

**Identifiants par défaut :**
- **Utilisateur** : `admin`
- **Mot de passe** : `jotna2026admin`

---

## 🔗 Connecter votre Formulaire Framer

Dans l'éditeur de votre landing page Framer :

1. Cliquez sur le composant **Formulaire**.
2. Dans les paramètres de soumission (*Form Submit Action*), choisissez **Webhook / Custom URL**.
3. Indiquez l'URL de votre Webhook (ex: `https://votre-domaine.com/api/webhook/framer`).
4. Dans la section **Headers**, ajoutez :
   - Nom de l'en-tête : `X-Webhook-Secret`
   - Valeur : `jotna_secret_webhook_key_2026` *(ou la clé configurée dans votre fichier `.env`)*

---

## 📋 Champs Pris en Charge

| Champ Technique | Nom sur le Formulaire Framer | Description |
| :--- | :--- | :--- |
| `pharmacist_name` | Nom du pharmacien | Nom et prénom |
| `pharmacy_name` | Nom de la pharmacie | Établissement |
| `city` | Ville | Localisation |
| `phone` | Téléphone / WhatsApp | Numéro de contact |
| `email` | Adresse Email | Courriel |
| `current_stock_management` | Mode actuel de gestion des stocks | Excel, Registre, Logiciel... |
| `main_stock_issue` | Principal problème de stock | Ruptures, péremption, surstock... |
| `out_of_stock_frequency` | Fréquence des ruptures | Hebdomadaire, mensuelle... |
| `order_time_spent` | Temps consacré aux commandes | Heures par semaine |
| `can_export_data` | Possibilité d'exporter les données | Oui / Non |
| `export_format` | Format d'export | CSV, Excel, PDF... |
| `pilot_interest` | Intérêt pour le programme pilote | Oui / Non / Intéressé |
| `main_goal` | Objectif principal avec JOTNA | Attente majeure |
| `created_at` | Horodatage automatique | Date et Heure précises |

---

## 🔐 Sécurité & Fichier `.env`

Les paramètres de sécurité sont configurables dans le fichier `.env` à la racine :

```env
PORT=5000
WEBHOOK_SECRET=jotna_secret_webhook_key_2026
JWT_SECRET=jotna_jwt_super_secret_key_change_in_production
ADMIN_USERNAME=admin
ADMIN_PASSWORD=jotna2026admin
```
