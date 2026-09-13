import React from 'react';
import { AlertTriangle } from 'lucide-react';

export default function ConfirmDialog({ title, message, onCancel, onConfirm, confirmLabel = 'Supprimer', loading }) {
  return (
    <div className="modal-overlay confirm-overlay" onClick={onCancel}>
      <div className="modal confirm-modal" onClick={(e) => e.stopPropagation()}>
        <div className="confirm-body">
          <div className="confirm-icon"><AlertTriangle size={26} /></div>
          <div className="confirm-text">
            <h3>{title}</h3>
            {message && <p>{message}</p>}
          </div>
        </div>
        <div className="modal-footer">
          <button type="button" className="btn btn-ghost" onClick={onCancel}>Annuler</button>
          <button type="button" className="btn btn-danger" onClick={onConfirm} disabled={loading}>
            {loading ? <span className="spinner" /> : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}