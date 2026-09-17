// Métadonnées des 48 colonnes du contrat (miroir de backend/contract-fields.js).
// type : 'text' | 'date' (YYYY-MM-DD) | 'int' | 'real'

export const FIELDS = [
  { key: 'import_id', label: 'ID', type: 'text' },
  { key: 'sap_ewp', label: 'SAP EWP', type: 'text' },
  { key: 'sap_eupac', label: 'SAP EUPAC', type: 'text' },
  { key: 'wbs', label: 'WBS', type: 'text' },
  { key: 'sold_to_party', label: 'Sold to party', type: 'text' },
  { key: 'customer_name', label: 'Customer Name', type: 'text' },
  { key: 'main_contractual_subject', label: 'Main Contractual Subject', type: 'text' },
  { key: 'am_signature', label: 'Am signature', type: 'text' },
  { key: 'account_manager', label: 'Account Manager', type: 'text' },
  { key: 'amount', label: 'Amount', type: 'real' },
  { key: 'contract_type', label: 'Contract Type', type: 'text' },
  { key: 'service_type', label: 'Service Type', type: 'text' },
  { key: 'sc', label: 'SC', type: 'text', bool: true },
  { key: 'contract_include', label: 'Contract Include', type: 'text' },
  { key: 'rtp1', label: 'RTP1', type: 'text' },
  { key: 'rtp2', label: 'RTP2', type: 'text' },
  { key: 'rtp3', label: 'RTP3', type: 'text' },
  { key: 'intervention_time', label: 'Intervention Time', type: 'text' },
  { key: 'repair_time', label: 'Repair Time', type: 'text' },
  { key: 'service_window', label: 'Service Window', type: 'text' },
  { key: 'preventive_maintenance', label: 'Preventive Maintenance', type: 'text' },
  { key: 'backups', label: 'Backups', type: 'text' },
  { key: 'mise_a_dispo_personnel', label: 'Mise a dispo personnel', type: 'text' },
  { key: 'remote_service', label: 'Remote service', type: 'text' },
  { key: 'sw_upgrades', label: 'Sw upgrades', type: 'text' },
  { key: 'created_date', label: 'Created date', type: 'date' },
  { key: 'ticket_number', label: 'Ticket Number', type: 'text' },
  { key: 'cso', label: 'CSO', type: 'text' },
  { key: 'special_conditions', label: 'Special conditions', type: 'text' },
  { key: 'contract_start', label: 'Contract start', type: 'date' },
  { key: 'duration_month', label: 'Duration month', type: 'int' },
  { key: 'contract_end', label: 'Contract end', type: 'date' },
  { key: 'renew_month', label: 'Renew month', type: 'int' },
  { key: 'billing', label: 'Billing', type: 'text', bool: true },
  { key: 'garantie', label: 'Garantie', type: 'int', bool: true },
  { key: 'remarks_bac', label: 'Remarks bac', type: 'text' },
  { key: 'phone_include', label: 'Phone Include', type: 'int', bool: true },
  { key: 'ga', label: 'GA', type: 'text', bool: true },
  { key: 'customer_group', label: 'Customer group', type: 'text' },
  { key: 'product_group', label: 'Product_group', type: 'text' },
  { key: 'remarks_bac_2', label: 'Contact Client', type: 'text' },
  { key: 'contract_stop', label: 'Contract Stop', type: 'int', bool: true },
  { key: 'contract_stop_date', label: 'Contract Stop Date', type: 'date' },
  { key: 'id_customer', label: 'IDCustomer', type: 'text' },
  { key: 'remote', label: 'Remote', type: 'int' },
  { key: 'date_remote', label: 'Date Remote', type: 'date' },
  { key: 'dlu_p', label: 'DLU-P', type: 'text' },
  { key: 'dlu_v', label: 'DLU-V', type: 'text' }
];

const WIDE = ['special_conditions', 'remarks_bac', 'remarks_bac_2'];

// Largeur relative (%) par défaut de chaque colonne
export const DEFAULT_WIDTHS = Object.fromEntries(
  FIELDS.map((f) => {
    let w;
    if (f.type === 'date') w = 6.5;
    else if (f.type === 'int' || f.type === 'real') w = 5.5;
    else if (WIDE.includes(f.key)) w = 14;
    else if (f.key === 'customer_name') w = 14;
    else w = 7.5;
    return [f.key, w];
  })
);

// Colonnes visibles par défaut (les autres restent disponibles via « Choisir des colonnes »)
export const DEFAULT_VISIBLE = [
  'customer_name', 'sap_ewp', 'sap_eupac', 'sold_to_party', 'main_contractual_subject',
  'contract_type', 'service_type', 'contract_include', 'service_window', 'amount',
  'account_manager', 'contract_start', 'duration_month', 'contract_end', 'renew_month',
  'contract_stop', 'contract_stop_date', 'remarks_bac', 'product_group', 'customer_group'
];