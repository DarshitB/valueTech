// src/components/ConfirmationModal.jsx
import React from "react";
import "./ConfirmationModal.scss";
import { createPortal } from "react-dom";

function ConfirmationModal({ title, message, onConfirm, onCancel }) {
  return createPortal(
    <div className="modal-overlay">
      <div className="modal-content">
        <h2 className="modal-title">{title}</h2>
        <p
          className="modal-message"
          dangerouslySetInnerHTML={{ __html: message }}
        ></p>
        <div className="modal-actions">
          <button className="btn secondary" onClick={onConfirm}>
            Confirm
          </button>
          <button className="btn" onClick={onCancel}>
            Cancel
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

export default ConfirmationModal;
