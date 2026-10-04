const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');

const DB_DIR = path.join(__dirname, 'data');
const DB_FILE = path.join(DB_DIR, 'db.json');

// Ensure data directory exists
if (!fs.existsSync(DB_DIR)) {
  fs.mkdirSync(DB_DIR, { recursive: true });
}

// Initial DB structure
const initialData = {
  admins: [],
  submissions: [],
  meta: {
    lastSubmissionId: 0
  }
};

// Helper to read DB
function readDB() {
  try {
    if (!fs.existsSync(DB_FILE)) {
      writeDB(initialData);
      return initialData;
    }
    const content = fs.readFileSync(DB_FILE, 'utf-8');
    return JSON.parse(content);
  } catch (err) {
    console.error('Error reading database file, resetting to clean state:', err);
    return initialData;
  }
}

// Helper to write DB atomically
function writeDB(data) {
  const tempFile = `${DB_FILE}.tmp`;
  fs.writeFileSync(tempFile, JSON.stringify(data, null, 2), 'utf-8');
  fs.renameSync(tempFile, DB_FILE);
}

// Initialize database with default admin
async function initDB() {
  const db = readDB();
  
  // Seed admin if not present
  const adminUsername = process.env.ADMIN_USERNAME || 'admin';
  const adminPassword = process.env.ADMIN_PASSWORD || 'jotna2026admin';
  
  const existingAdmin = db.admins.find(a => a.username === adminUsername);
  if (!existingAdmin) {
    const password_hash = await bcrypt.hash(adminPassword, 10);
    db.admins.push({
      id: 1,
      username: adminUsername,
      password_hash,
      created_at: new Date().toISOString()
    });
    writeDB(db);
    console.log(`[DB] Admin account created for username: "${adminUsername}"`);
  }
  return db;
}

// Add a submission from Framer webhook
function addSubmission(formData) {
  const db = readDB();
  db.meta.lastSubmissionId = (db.meta.lastSubmissionId || 0) + 1;
  const newId = db.meta.lastSubmissionId;
  const now = new Date().toISOString();

  const submission = {
    id: newId,
    pharmacist_name: (formData.pharmacist_name || formData.nom_pharmacien || formData.pharmacist || '').trim(),
    pharmacy_name: (formData.pharmacy_name || formData.nom_pharmacie || formData.pharmacie || '').trim(),
    city: (formData.city || formData.ville || '').trim(),
    phone: (formData.phone || formData.telephone || formData.whatsapp || '').trim(),
    email: (formData.email || '').trim().toLowerCase(),
    current_stock_management: (formData.current_stock_management || formData.mode_gestion_stocks || formData.stock_management || '').trim(),
    main_stock_issue: (formData.main_stock_issue || formData.principal_probleme_stock || formData.stock_issue || '').trim(),
    out_of_stock_frequency: (formData.out_of_stock_frequency || formData.frequence_ruptures || '').trim(),
    order_time_spent: (formData.order_time_spent || formData.temps_commande || '').trim(),
    can_export_data: (formData.can_export_data || formData.possibilite_export || '').trim(),
    export_format: (formData.export_format || formData.format_export || '').trim(),
    pilot_interest: (formData.pilot_interest || formData.interet_pilote || '').trim(),
    main_goal: (formData.main_goal || formData.objectif_principal || '').trim(),
    raw_payload: formData, // Keep full original body for complete auditability
    created_at: now
  };

  db.submissions.unshift(submission); // Newest first
  writeDB(db);
  return submission;
}

// Search and Filter Submissions for Admin Panel
function getSubmissions({ search, city, pilot_interest, stock_management, page = 1, limit = 20 }) {
  const db = readDB();
  let items = [...db.submissions];

  // 1. Text Search (Matches across pharmacist name, pharmacy name, city, phone, email, main goal)
  if (search && search.trim() !== '') {
    const q = search.trim().toLowerCase();
    items = items.filter(item => 
      item.pharmacist_name.toLowerCase().includes(q) ||
      item.pharmacy_name.toLowerCase().includes(q) ||
      item.city.toLowerCase().includes(q) ||
      item.email.toLowerCase().includes(q) ||
      item.phone.toLowerCase().includes(q) ||
      item.main_stock_issue.toLowerCase().includes(q) ||
      item.main_goal.toLowerCase().includes(q)
    );
  }

  // 2. City Filter
  if (city && city.trim() !== '') {
    items = items.filter(item => item.city.toLowerCase() === city.trim().toLowerCase());
  }

  // 3. Pilot Interest Filter
  if (pilot_interest && pilot_interest.trim() !== '') {
    const filterVal = pilot_interest.trim().toLowerCase();
    items = items.filter(item => {
      const val = item.pilot_interest.toLowerCase();
      if (filterVal === 'yes' || filterVal === 'oui' || filterVal === 'true') {
        return val.includes('oui') || val.includes('yes') || val === 'true';
      }
      if (filterVal === 'no' || filterVal === 'non' || filterVal === 'false') {
        return val.includes('non') || val.includes('no') || val === 'false';
      }
      return val === filterVal;
    });
  }

  // 4. Stock Management Filter
  if (stock_management && stock_management.trim() !== '') {
    items = items.filter(item => item.current_stock_management.toLowerCase().includes(stock_management.trim().toLowerCase()));
  }

  // Compute Overall Stats
  const totalCount = db.submissions.length;
  const filteredCount = items.length;
  
  const pilotInterestCount = db.submissions.filter(item => {
    const val = (item.pilot_interest || '').toLowerCase();
    return val.includes('oui') || val.includes('yes') || val === 'true';
  }).length;

  const uniqueCities = [...new Set(db.submissions.map(item => item.city).filter(Boolean))];

  // Pagination
  const pageNum = parseInt(page, 10) || 1;
  const limitNum = parseInt(limit, 10) || 20;
  const startIndex = (pageNum - 1) * limitNum;
  const paginatedItems = items.slice(startIndex, startIndex + limitNum);

  return {
    items: paginatedItems,
    pagination: {
      totalItems: filteredCount,
      totalPages: Math.ceil(filteredCount / limitNum) || 1,
      currentPage: pageNum,
      limit: limitNum
    },
    stats: {
      totalSubmissions: totalCount,
      filteredSubmissions: filteredCount,
      pilotInterestCount,
      uniqueCitiesCount: uniqueCities.length,
      citiesList: uniqueCities
    }
  };
}

// Get single submission by ID
function getSubmissionById(id) {
  const db = readDB();
  return db.submissions.find(item => item.id === parseInt(id, 10));
}

// Delete submission by ID
function deleteSubmission(id) {
  const db = readDB();
  const index = db.submissions.findIndex(item => item.id === parseInt(id, 10));
  if (index !== -1) {
    const deleted = db.submissions.splice(index, 1)[0];
    writeDB(db);
    return deleted;
  }
  return null;
}

// Admin Auth Helper
function getAdminByUsername(username) {
  const db = readDB();
  return db.admins.find(a => a.username === username);
}

module.exports = {
  initDB,
  addSubmission,
  getSubmissions,
  getSubmissionById,
  deleteSubmission,
  getAdminByUsername,
  readDB
};
