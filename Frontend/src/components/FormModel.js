import React from "react";
import "./ConfirmationModal.scss";
import "./FormModel.scss";
import { CloseIcon } from "./icons";

const FormModel = ({ children, size }) => {
  const { title, body, onClose } = children;
  return (
    <div className="modal-overlay form-model">
      <div className={`modal-dialog ${size}`}>
        <div className="modal-content">
          <div className="model-header">
            {/* Title */}
            {title && <h2 className="model-tital">{title}</h2>}
            {/* Close Button */}
            <button onClick={onClose} className="close-button">
              <CloseIcon />
            </button>
          </div>

          {/* Children content (form or any JSX) */}
          {body}
        </div>
      </div>
    </div>
  );
};

export default FormModel;
