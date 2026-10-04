require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

const db = require('./database');
const { verifyAdminToken } = require('./authMiddleware');

const app = express();
const PORT = process.env.PORT || 5000;

// Enable CORS for Framer landing page & admin portal
app.use(cors({
  origin: '*', // Allows submissions from Framer domain
  methods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Webhook-Secret']
}));

// Body parsing middlewares
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Serve Static Frontend Admin App
app.use(express.static(path.join(__dirname, 'public')));

// -------------------------------------------------------------
// HEALTH CHECK
// -------------------------------------------------------------
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    app: 'JOTNA Backend API',
    version: '1.0.0',
    timestamp: new Date().toISOString()
  });
});

// -------------------------------------------------------------
// WEBHOOK SECURISE FRAMER (RECEPTION & STOCKAGE)
// -------------------------------------------------------------
app.post('/api/webhook/framer', (req, res) => {
  try {
    // 1. Verify Secret Header or Query Param
    const secretHeader = req.headers['x-webhook-secret'];
    const secretQuery = req.query.secret;
    const expectedSecret = process.env.WEBHOOK_SECRET || 'jotna_secret_webhook_key_2026';

    if (secretHeader !== expectedSecret && secretQuery !== expectedSecret) {
      console.warn(`[WEBHOOK DENIED] Unauthorized submission attempt at ${new Date().toISOString()}`);
      return res.status(401).json({
        error: 'Non autorisé. Clé secrète de Webhook manquante ou invalide.'
      });
    }

    // 2. Extract Data
    const payload = req.body || {};

    if (Object.keys(payload).length === 0) {
      return res.status(400).json({
        error: 'Données de formulaire vides.'
      });
    }

    // 3. Save to Database
    const newSubmission = db.addSubmission(payload);

    console.log(`[WEBHOOK SUCCESS] Nouvelles réponses enregistrées de ${newSubmission.pharmacy_name || 'Pharmacie'} (${newSubmission.city || 'Inconnue'}) - ID #${newSubmission.id}`);

    return res.status(201).json({
      success: true,
      message: 'Soumission enregistrée avec succès dans le système JOTNA.',
      id: newSubmission.id,
      timestamp: newSubmission.created_at
    });

  } catch (err) {
    console.error('[WEBHOOK ERROR]', err);
    return res.status(500).json({
      error: 'Erreur interne lors du traitement de la soumission.'
    });
  }
});

// -------------------------------------------------------------
// ADMIN AUTHENTICATION
// -------------------------------------------------------------
app.post('/api/admin/login', async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: 'Veuillez saisir votre nom d\'utilisateur et mot de passe.' });
    }

    const admin = db.getAdminByUsername(username.trim());
    if (!admin) {
      return res.status(401).json({ error: 'Identifiants incorrects.' });
    }

    const isMatch = await bcrypt.compare(password, admin.password_hash);
    if (!isMatch) {
      return res.status(401).json({ error: 'Identifiants incorrects.' });
    }

    const token = jwt.sign(
      { id: admin.id, username: admin.username },
      process.env.JWT_SECRET || 'jotna_jwt_super_secret_key_change_in_production',
      { expiresIn: '24h' }
    );

    return res.json({
      success: true,
      token,
      username: admin.username,
      webhook_secret: process.env.WEBHOOK_SECRET || 'jotna_secret_webhook_key_2026'
    });

  } catch (err) {
    console.error('[LOGIN ERROR]', err);
    return res.status(500).json({ error: 'Erreur de connexion serveur.' });
  }
});

// -------------------------------------------------------------
// ADMIN SUBMISSIONS MANAGEMENT (SECURED)
// -------------------------------------------------------------

// Get list with filters & pagination
app.get('/api/admin/submissions', verifyAdminToken, (req, res) => {
  try {
    const { search, city, pilot_interest, stock_management, page, limit } = req.query;
    const result = db.getSubmissions({ search, city, pilot_interest, stock_management, page, limit });
    return res.json({
      success: true,
      ...result
    });
  } catch (err) {
    console.error('[GET SUBMISSIONS ERROR]', err);
    return res.status(500).json({ error: 'Erreur lors de la récupération des soumissions.' });
  }
});

// Single Submission Details
app.get('/api/admin/submissions/:id', verifyAdminToken, (req, res) => {
  try {
    const item = db.getSubmissionById(req.params.id);
    if (!item) {
      return res.status(404).json({ error: 'Soumission introuvable.' });
    }
    return res.json({ success: true, submission: item });
  } catch (err) {
    return res.status(500).json({ error: 'Erreur serveur.' });
  }
});

// Delete Submission
app.delete('/api/admin/submissions/:id', verifyAdminToken, (req, res) => {
  try {
    const deleted = db.deleteSubmission(req.params.id);
    if (!deleted) {
      return res.status(404).json({ error: 'Soumission introuvable ou déjà supprimée.' });
    }
    return res.json({ success: true, message: 'Soumission supprimée avec succès.' });
  } catch (err) {
    return res.status(500).json({ error: 'Erreur lors de la suppression.' });
  }
});

// Export to CSV with UTF-8 BOM
app.get('/api/admin/export/csv', (req, res) => {
  try {
    // Check token from query param or header
    const token = req.query.token || (req.headers['authorization'] || '').replace('Bearer ', '');
    if (!token) {
      return res.status(401).send('Non autorisé. Jeton manquant.');
    }
    
    try {
      jwt.verify(token, process.env.JWT_SECRET || 'jotna_jwt_super_secret_key_change_in_production');
    } catch (e) {
      return res.status(403).send('Jeton invalide ou expiré.');
    }

    const { search, city, pilot_interest, stock_management } = req.query;
    const result = db.getSubmissions({ search, city, pilot_interest, stock_management, page: 1, limit: 10000 });
    const items = result.items;

    // Build CSV header
    const headers = [
      'ID',
      'Date & Heure',
      'Nom Pharmacien',
      'Nom Pharmacie',
      'Ville',
      'Téléphone / WhatsApp',
      'Email',
      'Mode Gestion Stocks',
      'Principal Problème',
      'Fréquence Ruptures',
      'Temps Commandes',
      'Export Possible',
      'Format Export',
      'Intérêt Pilote',
      'Objectif Principal'
    ];

    // Helper to sanitize CSV fields
    const escapeCsv = (str) => {
      if (str === null || str === undefined) return '""';
      const val = String(str).replace(/"/g, '""');
      return `"${val}"`;
    };

    let csvRows = [headers.join(';')];

    items.forEach(item => {
      const dateFormatted = new Date(item.created_at).toLocaleString('fr-FR', { timeZone: 'UTC' });
      const row = [
        escapeCsv(item.id),
        escapeCsv(dateFormatted),
        escapeCsv(item.pharmacist_name),
        escapeCsv(item.pharmacy_name),
        escapeCsv(item.city),
        escapeCsv(item.phone),
        escapeCsv(item.email),
        escapeCsv(item.current_stock_management),
        escapeCsv(item.main_stock_issue),
        escapeCsv(item.out_of_stock_frequency),
        escapeCsv(item.order_time_spent),
        escapeCsv(item.can_export_data),
        escapeCsv(item.export_format),
        escapeCsv(item.pilot_interest),
        escapeCsv(item.main_goal)
      ];
      csvRows.push(row.join(';'));
    });

    const csvContent = '\uFEFF' + csvRows.join('\r\n'); // \uFEFF is UTF-8 BOM for Excel
    const fileName = `jotna_reponses_pharmacies_${new Date().toISOString().slice(0, 10)}.csv`;

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    return res.send(csvContent);

  } catch (err) {
    console.error('[CSV EXPORT ERROR]', err);
    return res.status(500).send('Erreur lors de l\'exportation CSV.');
  }
});

// -------------------------------------------------------------
// SEED MOCK DEMO DATA (FOR TESTING & PREVIEW)
// -------------------------------------------------------------
app.post('/api/admin/seed-demo', verifyAdminToken, (req, res) => {
  try {
    const mockData = [
      {
        pharmacist_name: "Dr. Amadou Diallo",
        pharmacy_name: "Pharmacie de la Corniche",
        city: "Dakar",
        phone: "+221 77 654 32 10",
        email: "a.diallo@pharmacie-corniche.sn",
        current_stock_management: "Cahier manuscrit & Excel",
        main_stock_issue: "Ruptures imprévues sur les antidiabétiques & surstock de génériques",
        out_of_stock_frequency: "Chaque semaine",
        order_time_spent: "8 à 10 heures / semaine",
        can_export_data: "Oui",
        export_format: "Excel / CSV",
        pilot_interest: "Oui, très intéressé",
        main_goal: "Anticiper les ruptures avant les pics saisonniers et réduire le temps de commande."
      },
      {
        pharmacist_name: "Dr. Aminata Sow",
        pharmacy_name: "Pharmacie Principale de Thiès",
        city: "Thiès",
        phone: "+221 78 123 45 67",
        email: "contact@pharmacie-thies.sn",
        current_stock_management: "Logiciel local (Pharmagest/Logiciel classique)",
        main_stock_issue: "Erreurs d'inventaire et dates de péremption manquées",
        out_of_stock_frequency: "1 à 2 fois par mois",
        order_time_spent: "4 heures / semaine",
        can_export_data: "Oui",
        export_format: "Excel",
        pilot_interest: "Oui",
        main_goal: "Automatiser le réapprovisionnement et éviter le surstock."
      },
      {
        pharmacist_name: "Dr. Cheikh Ndiaye",
        pharmacy_name: "Pharmacie de la Paix",
        city: "Saint-Louis",
        phone: "+221 70 987 65 43",
        email: "paix.stlouis@gmail.com",
        current_stock_management: "Registre papier uniquement",
        main_stock_issue: "Perte de traces sur les ventes d'urgence et livraisons fournisseurs tardives",
        out_of_stock_frequency: "Très fréquente (plusieurs fois par semaine)",
        order_time_spent: "15 heures / semaine",
        can_export_data: "Non",
        export_format: "Aucun",
        pilot_interest: "Oui",
        main_goal: "Disposer d'un outil simple sur mobile et ordinateur pour suivre mon stock en direct."
      },
      {
        pharmacist_name: "Dr. Fatou Bintou Kaba",
        pharmacy_name: "Pharmacie du Rond-Point",
        city: "Ziguinchor",
        phone: "+221 76 555 44 33",
        email: "fatou.kaba@rondpoint-zig.com",
        current_stock_management: "Excel personnalisé",
        main_stock_issue: "Délais d'approvisionnement depuis Dakar longs et imprévisibles",
        out_of_stock_frequency: "Chaque mois",
        order_time_spent: "6 heures / semaine",
        can_export_data: "Oui",
        export_format: "CSV",
        pilot_interest: "Oui, prêt à tester immédiatement",
        main_goal: "Prédire les besoins 1 mois à l'avance pour grouper les commandes."
      },
      {
        pharmacist_name: "Dr. Ousmane Sy",
        pharmacy_name: "Pharmacie Mbour Centrale",
        city: "Mbour",
        phone: "+221 77 321 09 87",
        email: "sy.ousmane@mbour-sante.sn",
        current_stock_management: "Logiciel de caisse basique",
        main_stock_issue: "Surstock bloquant de la trésorerie et ruptures sur les antibiotiques courants",
        out_of_stock_frequency: "Hebdomadaire",
        order_time_spent: "10 heures / semaine",
        can_export_data: "Oui",
        export_format: "PDF & Excel",
        pilot_interest: "Oui",
        main_goal: "Optimiser le fonds de roulement et réduire le temps passé sur le téléphone avec les grossistes."
      }
    ];

    mockData.forEach(item => db.addSubmission(item));
    return res.json({ success: true, message: '5 soumissions de démonstration ajoutées avec succès.' });
  } catch (err) {
    return res.status(500).json({ error: 'Erreur lors de l\'ajout des données de démo.' });
  }
});

// Fallback to index.html for SPA routing
app.use((req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// -------------------------------------------------------------
// START SERVER
// -------------------------------------------------------------
db.initDB().then(() => {
  app.listen(PORT, () => {
    console.log(`=======================================================`);
    console.log(`🚀 SERVEUR BACKEND JOTNA DÉMARRÉ AVEC SUCCÈS`);
    console.log(`📍 URL API / Dashboard : http://localhost:${PORT}`);
    console.log(`📥 URL Webhook Framer   : http://localhost:${PORT}/api/webhook/framer`);
    console.log(`🔑 Clé Secrète Webhook : ${process.env.WEBHOOK_SECRET || 'jotna_secret_webhook_key_2026'}`);
    console.log(`=======================================================`);
  });
}).catch(err => {
  console.error('Erreur d\'initialisation de la base de données:', err);
});
