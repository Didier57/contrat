// Métadonnées des 46 colonnes du fichier Excel modèle (feuillet « A » de Contract1.xlsx).
// Source unique pour : le schéma SQLite, l'import Excel, les routes, l'export et le frontend.
//
// type : 'text' | 'date' (YYYY-MM-DD) | 'int' | 'real'

const FIELDS = [
  { field: 'import_id', label: 'ID', type: 'text' },
  { field: 'sap_ewp', label: 'SAP EWP', type: 'text' },
  { field: 'sap_eupac', label: 'SAP EUPAC', type: 'text' },
  { field: 'wbs', label: 'WBS', type: 'text' },
  { field: 'sold_to_party', label: 'Sold to party', type: 'text' },
  { field: 'customer_name', label: 'Customer Name', type: 'text' },
  { field: 'main_contractual_subject', label: 'Main Contractual Subject', type: 'text' },
  { field: 'am_signature', label: 'Am signature', type: 'text' },
  { field: 'account_manager', label: 'Account Manager', type: 'text' },
  { field: 'amount', label: 'Amount', type: 'real' },
  { field: 'contract_type', label: 'Contract Type', type: 'text' },
  { field: 'service_type', label: 'Service Type', type: 'text' },
  { field: 'sc', label: 'SC', type: 'text', bool: true },
  { field: 'contract_include', label: 'Contract Include', type: 'text' },
  { field: 'rtp1', label: 'RTP1', type: 'text' },
  { field: 'rtp2', label: 'RTP2', type: 'text' },
  { field: 'rtp3', label: 'RTP3', type: 'text' },
  { field: 'intervention_time', label: 'Intervention Time', type: 'text' },
  { field: 'repair_time', label: 'Repair Time', type: 'text' },
  { field: 'service_window', label: 'Service Window', type: 'text' },
  { field: 'preventive_maintenance', label: 'Preventive Maintenance', type: 'text' },
  { field: 'backups', label: 'Backups', type: 'text' },
  { field: 'mise_a_dispo_personnel', label: 'Mise a dispo personnel', type: 'text' },
  { field: 'remote_service', label: 'Remote service', type: 'text' },
  { field: 'sw_upgrades', label: 'Sw upgrades', type: 'text' },
  { field: 'created_date', label: 'Created date', type: 'date' },
  { field: 'ticket_number', label: 'Ticket Number', type: 'text' },
  { field: 'cso', label: 'CSO', type: 'text' },
  { field: 'special_conditions', label: 'Special conditions', type: 'text' },
  { field: 'contract_start', label: 'Contract start', type: 'date' },
  { field: 'duration_month', label: 'Duration month', type: 'int' },
  { field: 'contract_end', label: 'Contract end', type: 'date' },
  { field: 'renew_month', label: 'Renew month', type: 'int' },
  { field: 'billing', label: 'Billing', type: 'text', bool: true },
  { field: 'garantie', label: 'Garantie', type: 'int', bool: true },
  { field: 'remarks_bac', label: 'Remarks bac', type: 'text' },
  { field: 'phone_include', label: 'Phone Include', type: 'int', bool: true },
  { field: 'ga', label: 'GA', type: 'text', bool: true },
  { field: 'customer_group', label: 'Customer group', type: 'text' },
  { field: 'product_group', label: 'Product_group', type: 'text' },
  { field: 'remarks_bac_2', label: 'Remarks bac 2', type: 'text' },
  { field: 'contract_stop', label: 'Contract Stop', type: 'int', bool: true },
  { field: 'contract_stop_date', label: 'Contract Stop Date', type: 'date' },
  { field: 'id_customer', label: 'IDCustomer', type: 'text' },
  { field: 'remote', label: 'Remote', type: 'int' },
  { field: 'date_remote', label: 'Date Remote', type: 'date' }
];

const FIELD_NAMES = FIELDS.map((f) => f.field);

module.exports = { FIELDS, FIELD_NAMES };